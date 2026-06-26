package main

import (
	"context"
	"log"
	"net/netip"
	"sort"
	"strings"
	"time"

	"tailscale.com/client/local"
	"tailscale.com/ipn/ipnstate"
	"tailscale.com/tsnet"
	"tailscale.com/types/key"
)

// tailnet wraps a userspace tsnet node and its local API client.
type tailnet struct {
	srv  *tsnet.Server
	lc   *local.Client
	addr []string // this node's tailnet addresses, captured once up
}

// newTailnet builds (but does not start) a tsnet node from config.
func newTailnet(cfg config) *tailnet {
	s := &tsnet.Server{
		Hostname:  cfg.Hostname,
		AuthKey:   cfg.AuthKey,
		Ephemeral: cfg.Ephemeral,
		// UserLogf carries operator-facing messages (login URL, state changes).
		UserLogf: log.Printf,
	}
	if cfg.ControlURL != "" {
		s.ControlURL = cfg.ControlURL
	}
	if cfg.StateDir != "" {
		s.Dir = cfg.StateDir
	}
	if cfg.Verbose {
		// Logf is the verbose backend logger; left nil it discards output.
		s.Logf = log.Printf
	}
	return &tailnet{srv: s}
}

// Start brings the node up on the tailnet and binds the local API client.
// It blocks until the node is registered and has an address, or ctx is done.
func (t *tailnet) Start(ctx context.Context) error {
	status, err := t.srv.Up(ctx)
	if err != nil {
		return err
	}
	lc, err := t.srv.LocalClient()
	if err != nil {
		return err
	}
	t.lc = lc
	for _, ip := range status.TailscaleIPs {
		t.addr = append(t.addr, ip.String())
	}
	return nil
}

// Addresses returns this node's tailnet IP addresses.
func (t *tailnet) Addresses() []string {
	return t.addr
}

// Close shuts the node down and deregisters it (if ephemeral).
func (t *tailnet) Close() error {
	if t.srv == nil {
		return nil
	}
	return t.srv.Close()
}

// peer is the public, JSON-facing view of a single tailnet node.
type peer struct {
	ID               string   `json:"id,omitempty"`
	Hostname         string   `json:"hostname"`
	DNSName          string   `json:"dnsName,omitempty"`
	OS               string   `json:"os,omitempty"`
	TailscaleVersion string   `json:"tailscaleVersion,omitempty"`
	Online           bool     `json:"online"`
	LastSeen         string   `json:"lastSeen,omitempty"` // RFC3339; control reports it only when offline
	Addresses        []string `json:"addresses"`          // tailnet IPs
	Endpoints        []string `json:"endpoints"`          // direct ip:port endpoints
	Relay            string   `json:"relay,omitempty"`    // DERP region in use
}

// peersResponse is the body returned by GET /peers.
type peersResponse struct {
	CollectedAt string `json:"collectedAt"`
	Self        *peer  `json:"self,omitempty"`
	PeerCount   int    `json:"peerCount"`
	Peers       []peer `json:"peers"`
}

// Peers reads the current tailnet status and projects it into the API shape.
func (t *tailnet) Peers(ctx context.Context) (*peersResponse, error) {
	status, err := t.lc.Status(ctx)
	if err != nil {
		return nil, err
	}

	resp := &peersResponse{
		CollectedAt: time.Now().UTC().Format(time.RFC3339),
		Peers:       make([]peer, 0, len(status.Peer)),
	}

	if status.Self != nil {
		self := t.toPeer(ctx, status.Self)
		// Our own version is always known from the local status.
		if self.TailscaleVersion == "" {
			self.TailscaleVersion = status.Version
		}
		resp.Self = &self
	}

	for _, ps := range status.Peer {
		resp.Peers = append(resp.Peers, t.toPeer(ctx, ps))
	}
	sort.Slice(resp.Peers, func(i, j int) bool {
		if resp.Peers[i].Hostname != resp.Peers[j].Hostname {
			return resp.Peers[i].Hostname < resp.Peers[j].Hostname
		}
		return resp.Peers[i].ID < resp.Peers[j].ID
	})
	resp.PeerCount = len(resp.Peers)
	return resp, nil
}

// toPeer converts a single tsnet PeerStatus into our public peer shape.
func (t *tailnet) toPeer(ctx context.Context, ps *ipnstate.PeerStatus) peer {
	p := peer{
		ID:               string(ps.ID),
		Hostname:         ps.HostName,
		DNSName:          strings.TrimSuffix(ps.DNSName, "."),
		OS:               ps.OS,
		Online:           ps.Online,
		Relay:            ps.Relay,
		Addresses:        addrsToStrings(ps.TailscaleIPs),
		Endpoints:        append([]string(nil), ps.Addrs...),
		TailscaleVersion: t.peerVersion(ctx, ps.PublicKey),
	}
	if !ps.LastSeen.IsZero() {
		p.LastSeen = ps.LastSeen.UTC().Format(time.RFC3339)
	}
	return p
}

// peerVersion best-effort resolves a peer's tailscale client version, which the
// status map does not carry directly. It is looked up via the node's Hostinfo
// and returns "" if unavailable.
func (t *tailnet) peerVersion(ctx context.Context, nodeKey key.NodePublic) string {
	if nodeKey.IsZero() {
		return ""
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	who, err := t.lc.WhoIsNodeKey(ctx, nodeKey)
	if err != nil || who == nil || who.Node == nil {
		return ""
	}
	hi := who.Node.Hostinfo
	if !hi.Valid() {
		return ""
	}
	return hi.IPNVersion()
}

func addrsToStrings(addrs []netip.Addr) []string {
	out := make([]string, 0, len(addrs))
	for _, a := range addrs {
		out = append(out, a.String())
	}
	return out
}
