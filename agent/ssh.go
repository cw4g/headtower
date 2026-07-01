package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	"golang.org/x/crypto/ssh"
)

// SSH bridge tuning. Terminals are long-lived, so there is no overall session
// deadline; only the dial and protocol handshake are bounded.
const (
	sshPort             = "22"
	sshDialTimeout      = 10 * time.Second
	sshHandshakeTimeout = 10 * time.Second
	ptyTerm             = "xterm-256color"
	ptyInitialCols      = 80
	ptyInitialRows      = 24
	wsReadLimit         = 1 << 20 // 1 MiB; roomy enough for large terminal pastes
)

// sshClaims is the payload carried by a signed /ssh access token. It names the
// tailnet node to reach and the SSH user to present, and bounds the token's
// validity window.
type sshClaims struct {
	Host string `json:"host"` // node hostname or tailnet IP to dial
	User string `json:"user"` // SSH user to present to the target
	Exp  int64  `json:"exp"`  // expiry, unix seconds
}

// verifySSHToken parses and authenticates a token of the form
//
//	base64url(payloadJSON) + "." + base64url(HMAC_SHA256(payloadJSON, secret))
//
// using unpadded (raw) base64url on both segments. The HMAC is computed over the
// exact payload bytes that were encoded, compared in constant time. It returns
// the decoded claims only when the signature is valid and the token is unexpired.
func verifySSHToken(token, secret string) (sshClaims, error) {
	var claims sshClaims
	if token == "" {
		return claims, errors.New("missing token")
	}
	// The token is "<payload>.<signature>"; split on the single separating dot.
	payloadB64, sigB64, ok := strings.Cut(token, ".")
	if !ok {
		return claims, errors.New("malformed token")
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(payloadB64)
	if err != nil {
		return claims, errors.New("invalid payload encoding")
	}
	gotSig, err := base64.RawURLEncoding.DecodeString(sigB64)
	if err != nil {
		return claims, errors.New("invalid signature encoding")
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payloadBytes)
	wantSig := mac.Sum(nil)
	if !hmac.Equal(gotSig, wantSig) {
		return claims, errors.New("signature mismatch")
	}

	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return claims, errors.New("invalid payload json")
	}
	if claims.Host == "" || claims.User == "" {
		return claims, errors.New("token missing host or user")
	}
	if claims.Exp <= 0 || time.Now().Unix() > claims.Exp {
		return claims, errors.New("token expired")
	}
	return claims, nil
}

// handleSSH upgrades GET /ssh to a websocket and bridges it to a Tailscale-SSH
// shell on the node named by a signed token. It is opt-in: with no secret
// configured the endpoint refuses with 503 so it can never be reached blindly.
func handleSSH(t *tailnet, secret string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if secret == "" {
			writeError(w, http.StatusServiceUnavailable,
				"ssh bridge disabled: set HEADTOWER_AGENT_SSH_SECRET to enable")
			return
		}

		claims, err := verifySSHToken(r.URL.Query().Get("token"), secret)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "ssh token rejected: "+err.Error())
			return
		}

		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			// The signed token is the trust boundary; the agent is a backend
			// service reached by the Headtower app (often via a proxy), so the
			// browser Origin will not match the agent host. Skip origin checks.
			InsecureSkipVerify: true,
		})
		if err != nil {
			// Accept already wrote an HTTP error response on failure.
			log.Printf("ssh: websocket accept failed: %v", err)
			return
		}
		conn.SetReadLimit(wsReadLimit)

		log.Printf("ssh: bridging %s@%s", claims.User, claims.Host)
		bridgeSSH(r.Context(), t, conn, claims)
	}
}

// bridgeSSH dials the target over the tailnet, opens a Tailscale-SSH shell, and
// shuttles bytes between the PTY and the websocket until either side ends.
func bridgeSSH(ctx context.Context, t *tailnet, conn *websocket.Conn, claims sshClaims) {
	ws := &wsBridge{conn: conn, ctx: ctx}

	client, netConn, err := dialTailscaleSSH(ctx, t, claims)
	if err != nil {
		ws.sendError(err.Error())
		conn.Close(websocket.StatusInternalError, "ssh connect failed")
		return
	}
	defer client.Close()
	defer netConn.Close()

	session, err := client.NewSession()
	if err != nil {
		ws.sendError("open session: " + err.Error())
		conn.Close(websocket.StatusInternalError, "ssh session failed")
		return
	}
	defer session.Close()

	stdin, err := session.StdinPipe()
	if err != nil {
		ws.sendError("open stdin: " + err.Error())
		conn.Close(websocket.StatusInternalError, "ssh stdin failed")
		return
	}
	// Stdout and stderr are streamed to the client as binary frames.
	session.Stdout = ws.binaryWriter()
	session.Stderr = ws.binaryWriter()

	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}
	if err := session.RequestPty(ptyTerm, ptyInitialRows, ptyInitialCols, modes); err != nil {
		ws.sendError("request pty: " + err.Error())
		conn.Close(websocket.StatusInternalError, "pty failed")
		return
	}
	if err := session.Shell(); err != nil {
		ws.sendError("start shell: " + err.Error())
		conn.Close(websocket.StatusInternalError, "shell failed")
		return
	}

	// Pump client -> PTY in the background.
	readErr := make(chan error, 1)
	go func() { readErr <- pumpClientToSSH(ctx, conn, stdin, session) }()

	// Wait for the shell to exit (in the background so we can also react to the
	// client hanging up).
	waitErr := make(chan error, 1)
	go func() { waitErr <- session.Wait() }()

	select {
	case err := <-waitErr:
		// The remote shell ended: report the exit status (or an error) and close.
		var exitErr *ssh.ExitError
		switch {
		case errors.As(err, &exitErr):
			ws.sendExit(exitErr.ExitStatus())
		case err != nil:
			ws.sendError("session ended: " + err.Error())
		default:
			ws.sendExit(0)
		}
		conn.Close(websocket.StatusNormalClosure, "session exited")
	case <-readErr:
		// The client closed the socket (or a read error occurred): tear the
		// shell down. Closing the session unblocks the wait goroutine.
		session.Close()
		conn.Close(websocket.StatusNormalClosure, "client closed")
	}
}

// dialTailscaleSSH dials host:22 through the tsnet node and completes a
// Tailscale-SSH handshake. Authentication uses the SSH "none" method: the client
// presents only the user, and the tailnet identity (enforced by the target's ssh
// ACL) is the credential. Host keys are ignored because the tailnet is the trust
// boundary. It returns the live client plus its net.Conn so both can be closed.
func dialTailscaleSSH(ctx context.Context, t *tailnet, claims sshClaims) (*ssh.Client, net.Conn, error) {
	addr := net.JoinHostPort(claims.Host, sshPort)

	dialCtx, cancel := context.WithTimeout(ctx, sshDialTimeout)
	defer cancel()
	netConn, err := t.Dial(dialCtx, "tcp", addr)
	if err != nil {
		return nil, nil, errors.New("dial " + addr + ": " + err.Error())
	}

	// Bound the handshake with a deadline on the raw conn, then clear it so the
	// long-lived session is not torn down mid-stream.
	_ = netConn.SetDeadline(time.Now().Add(sshHandshakeTimeout))
	cfg := &ssh.ClientConfig{
		User:            claims.User,
		Auth:            nil, // rely on the "none" method (Tailscale SSH)
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
	}
	sshConn, chans, reqs, err := ssh.NewClientConn(netConn, addr, cfg)
	if err != nil {
		netConn.Close()
		return nil, nil, errors.New("ssh handshake: " + err.Error())
	}
	_ = netConn.SetDeadline(time.Time{})

	return ssh.NewClient(sshConn, chans, reqs), netConn, nil
}

// controlMsg is a text-frame control message sent by the client. Currently only
// terminal resize is understood.
type controlMsg struct {
	Type string `json:"type"`
	Cols int    `json:"cols"`
	Rows int    `json:"rows"`
}

// pumpClientToSSH reads websocket frames and applies them: binary frames are raw
// stdin bytes, text frames are JSON control messages. It returns when the socket
// ends or a frame cannot be handled.
func pumpClientToSSH(ctx context.Context, conn *websocket.Conn, stdin io.WriteCloser, session *ssh.Session) error {
	for {
		typ, data, err := conn.Read(ctx)
		if err != nil {
			return err
		}
		switch typ {
		case websocket.MessageBinary:
			if _, err := stdin.Write(data); err != nil {
				return err
			}
		case websocket.MessageText:
			var msg controlMsg
			if err := json.Unmarshal(data, &msg); err != nil {
				continue // ignore unparseable control frames
			}
			if msg.Type == "resize" && msg.Cols > 0 && msg.Rows > 0 {
				// WindowChange takes (height, width) == (rows, cols).
				_ = session.WindowChange(msg.Rows, msg.Cols)
			}
		}
	}
}

// wsBridge serializes writes to a websocket so the concurrent stdout, stderr,
// and control writers cannot interleave frames.
type wsBridge struct {
	conn *websocket.Conn
	ctx  context.Context
	mu   sync.Mutex
}

func (b *wsBridge) writeBinary(p []byte) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.conn.Write(b.ctx, websocket.MessageBinary, p)
}

func (b *wsBridge) writeText(p []byte) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.conn.Write(b.ctx, websocket.MessageText, p)
}

// binaryWriter adapts the bridge to an io.Writer that emits binary frames.
func (b *wsBridge) binaryWriter() *wsBinaryWriter { return &wsBinaryWriter{b: b} }

func (b *wsBridge) sendError(message string) {
	payload, _ := json.Marshal(map[string]string{"type": "error", "message": message})
	_ = b.writeText(payload)
}

func (b *wsBridge) sendExit(code int) {
	payload, _ := json.Marshal(map[string]any{"type": "exit", "code": code})
	_ = b.writeText(payload)
}

// wsBinaryWriter streams bytes to the client as websocket binary frames.
type wsBinaryWriter struct{ b *wsBridge }

func (w *wsBinaryWriter) Write(p []byte) (int, error) {
	if err := w.b.writeBinary(p); err != nil {
		return 0, err
	}
	return len(p), nil
}
