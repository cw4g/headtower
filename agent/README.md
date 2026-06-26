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
- Serves two endpoints over plain HTTP:
  - `GET /healthz` - liveness probe.
  - `GET /peers` - the tailnet peers this node can see.

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

## Notes

- The agent serves plain HTTP on `HEADTOWER_AGENT_ADDR`; run it where only
  Headtower can reach it (loopback, a private interface, or behind the tailnet).
- An ephemeral auth key plus `HEADTOWER_AGENT_EPHEMERAL=true` keeps the tailnet
  device list clean across restarts.
