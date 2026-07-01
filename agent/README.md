# headtower-agent

A small tailnet sidecar for the Headtower console.

Headscale is the control plane for a tailnet, but its admin API does not report
the live per-device metadata that an operator wants to see at a glance: which
client version a node runs, its OS, its current endpoints, whether it is online
right now, and when it was last seen. That information lives on the tailnet
itself.

`headtower-agent` joins the tailnet as a userspace node (via Tailscale's
[`tsnet`](https://pkg.go.dev/tailscale.com/tsnet)) and exposes a tiny JSON HTTP
API describing every peer it can see. Headtower calls this agent to enrich the
device view that Headscale alone cannot provide.

This is original work. It shares no code with any other project.

## What it does

- Joins a Headscale/Tailscale tailnet using a pre-auth key.
- Reads peer state from the in-process Tailscale local API.
- Serves these endpoints:
  - `GET /healthz` - liveness probe.
  - `GET /peers` - the tailnet peers this node can see.
  - `GET /ssh` - a websocket that bridges a browser terminal to a
    Tailscale-SSH shell on a tailnet node (opt-in; token-authenticated).

## Configuration

All configuration is via environment variables.

| Variable                       | Required | Default            | Description |
| ------------------------------ | -------- | ------------------ | ----------- |
| `HEADTOWER_AGENT_AUTHKEY`      | yes      | -                  | Tailnet pre-auth key used to register the node. |
| `HEADTOWER_AGENT_LOGIN_SERVER` | no       | Tailscale default  | Control plane URL, e.g. your Headscale server `https://headscale.example.com`. |
| `HEADTOWER_AGENT_HOSTNAME`     | no       | `headtower-agent`  | Node name presented to the control plane. |
| `HEADTOWER_AGENT_ADDR`         | no       | `:8410`            | Address the JSON API listens on. |
| `HEADTOWER_AGENT_STATE_DIR`    | no       | OS config dir      | Directory for tsnet node state. |
| `HEADTOWER_AGENT_EPHEMERAL`    | no       | `false`            | Register as an ephemeral node (auto-removed when it goes offline). |
| `HEADTOWER_AGENT_VERBOSE`      | no       | `false`            | Emit verbose tsnet backend logs for debugging. |
| `HEADTOWER_AGENT_SSH_SECRET`   | no       | -                  | Shared HMAC secret that signs `/ssh` access tokens. **Unset disables `/ssh` (returns 503).** Set the same value in the Headtower app. |

## Build

```sh
cd agent
go mod tidy
go build ./...
```

## Run

```sh
export HEADTOWER_AGENT_AUTHKEY="tskey-auth-..."
export HEADTOWER_AGENT_LOGIN_SERVER="https://headscale.example.com"
export HEADTOWER_AGENT_HOSTNAME="headtower-agent"

go run .
# or build a binary and run it:
go build -o headtower-agent . && ./headtower-agent
```

The process logs when it joins the tailnet and when the API is serving, then
runs until it receives `SIGINT` or `SIGTERM`, at which point it drains in-flight
requests and leaves the tailnet cleanly.

## API

### `GET /healthz`

```json
{
  "service": "headtower-agent",
  "status": "ok",
  "time": "2026-06-26T13:16:17Z"
}
```

### `GET /peers`

Returns this node (`self`) and every peer it can see. `lastSeen` is only present
when the control plane reports a node as offline. `tailscaleVersion` is resolved
best-effort and may be empty for some peers.

```json
{
  "collectedAt": "2026-06-26T13:16:20Z",
  "self": {
    "id": "n1a2b3c4",
    "hostname": "headtower-agent",
    "dnsName": "headtower-agent.tailnet.example",
    "os": "linux",
    "tailscaleVersion": "1.100.0-t1234567",
    "online": true,
    "addresses": ["100.64.0.5", "fd7a:115c:a1e0::5"],
    "endpoints": [],
    "relay": "lhr"
  },
  "peerCount": 1,
  "peers": [
    {
      "id": "nf5e6d7c",
      "hostname": "laptop",
      "dnsName": "laptop.tailnet.example",
      "os": "macOS",
      "tailscaleVersion": "1.100.0-tabcdef0",
      "online": true,
      "lastSeen": "2026-06-26T12:58:01Z",
      "addresses": ["100.64.0.9"],
      "endpoints": ["192.0.2.10:41641", "198.51.100.7:3478"],
      "relay": "fra"
    }
  ]
}
```

#### Peer fields

| Field              | Source                          | Notes |
| ------------------ | ------------------------------- | ----- |
| `id`               | stable node ID                  | |
| `hostname`         | reported host name              | |
| `dnsName`          | MagicDNS name                   | trailing dot trimmed |
| `os`               | host OS                         | |
| `tailscaleVersion` | node Hostinfo (best-effort)     | not in the status map; resolved per peer |
| `online`           | control-plane connectivity      | |
| `lastSeen`         | last seen by control            | present only when offline |
| `addresses`        | tailnet IPs                     | |
| `endpoints`        | direct `ip:port` endpoints      | |
| `relay`            | DERP region in use              | |

### `GET /ssh` (websocket)

Bridges a browser terminal to a **Tailscale-SSH** shell on a tailnet node. The
agent dials `host:22` **over the tailnet** (via tsnet), completes an SSH
handshake using the `none` auth method - the tailnet identity is the credential -
requests an `xterm-256color` PTY (initial 80x24), starts a shell, and shuttles
bytes between the PTY and the websocket.

This endpoint is **opt-in**: if `HEADTOWER_AGENT_SSH_SECRET` is unset the agent
returns `503 Service Unavailable` and never dials anything.

Target nodes must run Tailscale SSH (`tailscale up --ssh`) and the tailnet's SSH
ACL must permit **this agent's tailnet identity** to SSH to them as the requested
user. Host keys are intentionally ignored: the tailnet mesh is the trust
boundary, not SSH host-key pinning.

#### Access token

Auth is a signed token passed as the `?token=` query parameter on the upgrade
request. It is HMAC-SHA256 over a small JSON payload, shared with the app via
`HEADTOWER_AGENT_SSH_SECRET`.

```
token = base64url(payloadJSON) + "." + base64url(HMAC_SHA256(payloadJSON, secret))
```

- Both segments use **unpadded** base64url (Go `base64.RawURLEncoding`, RFC 4648
  §5, no `=` padding).
- `payloadJSON` is the raw UTF-8 JSON bytes below. The HMAC is computed over
  **exactly those bytes** (the ones that were base64url-encoded into the first
  segment), keyed by the shared secret.

```json
{ "host": "<node hostname or tailnet ip>", "user": "<ssh user>", "exp": 1893456000 }
```

| Field  | Type          | Meaning |
| ------ | ------------- | ------- |
| `host` | string        | Node hostname (MagicDNS) or tailnet IP to dial on port 22. |
| `user` | string        | SSH user to present to the target. |
| `exp`  | number (int)  | Expiry as Unix seconds. |

Validation on the agent: split on the single `.`, base64url-decode both parts,
recompute the HMAC over the decoded payload bytes and compare in **constant
time** (`hmac.Equal`), then reject if the signature mismatches, `host`/`user` are
empty, or `exp` is in the past. Any failure returns `401`.

Reference (Node/TypeScript) for minting a token in the app:

```ts
import { createHmac } from "node:crypto";

function b64url(buf: Buffer) {
  return buf.toString("base64url"); // unpadded base64url
}

export function mintSshToken(secret: string, host: string, user: string, ttlSeconds = 60) {
  const payload = JSON.stringify({ host, user, exp: Math.floor(Date.now() / 1000) + ttlSeconds });
  const payloadBytes = Buffer.from(payload, "utf8");
  const sig = createHmac("sha256", secret).update(payloadBytes).digest();
  return `${b64url(payloadBytes)}.${b64url(sig)}`;
}
```

#### Websocket message protocol

Once upgraded, frames are exchanged as follows. **Frame type matters**: binary
carries raw terminal bytes, text carries JSON control/status messages.

Client -> agent:

| Frame type | Payload | Meaning |
| ---------- | ------- | ------- |
| binary     | raw bytes | stdin - written verbatim to the shell's stdin. |
| text       | `{"type":"resize","cols":N,"rows":N}` | resize the PTY (`SIGWINCH`). `cols`/`rows` must be positive; other/unknown text frames are ignored. |

Agent -> client:

| Frame type | Payload | Meaning |
| ---------- | ------- | ------- |
| binary     | raw bytes | shell stdout/stderr, streamed as produced. |
| text       | `{"type":"error","message":"..."}` | a failure (dial/handshake/session error); the socket then closes. |
| text       | `{"type":"exit","code":N}` | the shell exited with status `N`; the socket then closes cleanly. |

The socket closes cleanly when either side ends: if the remote shell exits the
agent sends `exit` (or `error`) then closes; if the client closes the socket the
agent tears the SSH session down.

## Notes

- The agent serves plain HTTP on `HEADTOWER_AGENT_ADDR`; run it where only
  Headtower can reach it (loopback, a private interface, or behind the tailnet).
  This matters more once `/ssh` is enabled: anyone able to reach the endpoint
  **and** holding the shared secret can open a shell on nodes the agent may SSH
  to. Keep `HEADTOWER_AGENT_SSH_SECRET` high-entropy and mint short-lived tokens.
- The `/ssh` bridge only works against nodes with Tailscale SSH enabled and an
  SSH ACL that permits this agent's identity; it does not use SSH keys or
  passwords.
- An ephemeral auth key plus `HEADTOWER_AGENT_EPHEMERAL=true` keeps the tailnet
  device list clean across restarts.
