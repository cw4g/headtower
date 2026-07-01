<div align="center">

# Headtower

**An operator's console for your [Headscale](https://github.com/juanfont/headscale) tailnet.**

Feature-rich, self-hosted, and zero-config - run it, open it, and set everything up from the UI. No `.env` to write before you can even see the page.

`Next.js` · `SQLite` · `AGPL-3.0`

</div>

---

Headtower is a control panel for [Headscale](https://github.com/juanfont/headscale), the open-source [Tailscale](https://tailscale.com) control server. It behaves like an operator's instrument panel - schematic, precise, and honest about state - rather than a marketing dashboard. A first-run setup wizard connects Headscale and, optionally, your SSO right from the browser, so there is nothing to configure before launch.

## Highlights

- **Zero-config start** — `docker compose up`, open the page, and a wizard connects Headscale (live-tested) and optional OIDC. Change any of it later from **Settings**, no restart, no re-compose.
- **Machines** — a live table *and* rich host cards: status, OS / client version, addresses, tags, routes, last-seen.
- **Dashboard** — a live tailnet *coverage* view plus graphs (OS distribution, online-over-time, key-expiry timeline).
- **Access** — a visual ACL/policy editor and a JSON editor with a lossless round-trip.
- **Routes** — subnet and exit-node approvals.
- **Audit log** — every change recorded, filterable, with CSV export.
- **Auth** — single-operator (API key) out of the box, or full OIDC (PKCE) sessions.
- **RBAC** — roles and capabilities; every mutation is permission-gated and audited.
- **Agent** *(optional)* — a lightweight Go sidecar reporting device OS, client version, and endpoints the Headscale API does not expose.
- Command palette (`Cmd-K`), light / dark, keyboard-first, fully responsive.

## Quick start

```bash
git clone https://github.com/rnihesh/headtower.git
cd headtower
docker compose up -d
```

Open `http://<your-host>:3000` and follow the setup wizard: point it at your Headscale URL + API key, optionally wire OIDC, and you are in. State lives in a local SQLite file and everything is editable from **Settings**.

> Prefer declarative config? Set `HEADSCALE_URL` / `HEADSCALE_API_KEY` (and the `HEADTOWER_OIDC_*` vars) as environment and the wizard is skipped. Env is optional, never required.

## Development

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm build

cd docs  && pnpm dev   # docs site (Nextra)
cd agent && go run .   # device-metadata agent
```

## Architecture

- **App** — Next.js (App Router, RSC-first) + React + TypeScript + Tailwind.
- **Store** — SQLite via `node:sqlite` + drizzle, for settings, sessions, and the audit log. Headscale stays the source of truth for tailnet data.
- **Agent** — a small Go binary using `tsnet` for device metadata.
- **Docs** — a standalone Nextra site under `docs/`.

## License

[AGPL-3.0](./LICENSE) © 2026 Nihesh.

Built for [Headscale](https://github.com/juanfont/headscale). Not affiliated with Tailscale or Headscale.
