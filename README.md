<div align="center">

# Headtower

**An operator's console for your [Headscale](https://github.com/juanfont/headscale) tailnet.**

Feature-rich, self-hosted, and configured from Docker Compose - no setup wizard to click through, no `.env` to hand-edit after the fact.

`Next.js` · `SQLite` · `AGPL-3.0`

</div>

---

Headtower is a control panel for [Headscale](https://github.com/juanfont/headscale), the open-source [Tailscale](https://tailscale.com) control server. It behaves like an operator's instrument panel - schematic, precise, and honest about state - rather than a marketing dashboard.

![Dashboard](https://headtower.niheshr.com/screenshots/dashboard.png)

![Machines](https://headtower.niheshr.com/screenshots/machines.png)

![Access](https://headtower.niheshr.com/screenshots/access-control.png)

![Command palette](https://headtower.niheshr.com/screenshots/command-palette.png)

More in the [full screenshot gallery](https://headtower.niheshr.com/screenshots).

## Highlights

**Devices**
- A live table *and* rich host cards: status, OS + client version (real numbers, e.g. "iOS 17.4", pulled by the optional agent), addresses, tags, routes, last-seen.
- Add a device three ways: mint a fresh pre-auth key, paste one you already have, or register a device that's mid-login - each shows a ready-to-run `tailscale up` command with a QR code to scan from a phone.
- Rename, tag, expire, or delete a node inline, no CLI.

**Dashboard**
- A live coverage view grouped by OS, an online-over-time graph, OS/version breakdowns, expiring-key warnings, a recent-activity feed, and an agent health widget.

**Access, Routes, DNS**
- A visual ACL/policy editor with a lossless JSON round-trip.
- Subnet and exit-node route approvals.
- DNS is read-only by design: Headscale's REST API exposes no DNS endpoints in this version range, so Headtower reports the server config faithfully rather than showing controls that can't take effect.

**Identity and access**
- Operator mode (no sign-in) or single sign-on, your choice.
- **Multiple OIDC providers at once** - Google, Microsoft Entra, Okta, Auth0, Pocket ID, or any other OIDC-compliant identity provider, each its own button on the login page, added and managed from Settings.
- **Members and roles** - owner, admin, operator, and viewer, with a real management page (promote, demote, remove) protected against locking out the last owner.
- **Self-service account page** - your own active sessions (revoke individually or sign out everywhere else), personal API keys, and appearance preferences.

**Audit and SSH**
- Every mutation recorded: actor, action, target, before/after detail, filterable and paginated, with CSV export.
- An optional lightweight Go agent (`tsnet`) reports device OS/version/endpoints the Headscale API doesn't expose, and bridges a browser-based SSH terminal straight to a device - each session logged (who, which device, when).

**Everything else**
- A command palette (`Cmd-K`): jump to any page, run quick actions, search live devices, or jump to recent activity.
- A full-database backup export from Settings.
- Docker images published to GHCR on every change, with an in-app "update available" indicator.
- RBAC on every mutation, light/dark theme, keyboard-first, fully responsive.

## Quick start

```bash
git clone https://github.com/rnihesh/headtower.git
cd headtower
cp .env.example .env   # set HEADSCALE_URL + HEADSCALE_API_KEY at minimum
docker compose up -d
```

Open `http://<your-host>:3000`. The Headscale connection comes from `.env` (no wizard); everything else - identity providers, the agent, roles, DNS/policy - is configured from **Settings** once you're in, no restart required.

## Development

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm build

cd docs  && pnpm dev   # docs site (Nextra)
cd agent && go run .   # device-metadata + SSH agent
```

## Architecture

- **App** - Next.js (App Router, RSC-first) + React + TypeScript + Tailwind.
- **Store** - SQLite via `node:sqlite` + drizzle: accounts, sessions, roles, identity providers, audit log, SSH session log, personal API keys. Headscale stays the source of truth for tailnet data.
- **Agent** *(optional)* - a small Go binary using `tsnet` for device metadata and the browser-SSH bridge.
- **Docs** - a standalone Nextra site under `docs/`, deployed to GitHub Pages.

## License

[AGPL-3.0](./LICENSE) © 2026 Nihesh.

Built for [Headscale](https://github.com/juanfont/headscale). Not affiliated with Tailscale or Headscale.
