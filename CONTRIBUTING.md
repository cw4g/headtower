# Contributing to Headtower

Thanks for helping build a better console for Headscale.

## Getting started

```bash
git clone https://github.com/rnihesh/headtower.git
cd headtower
pnpm install
cp .env.example .env   # point HEADSCALE_URL + HEADSCALE_API_KEY at a test server
pnpm dev               # http://localhost:3000
```

The docs site lives in `docs/` (Nextra): `cd docs && pnpm dev`.
The optional device agent lives in `agent/` (Go): `cd agent && go run .`

Use a throwaway Headscale for development, never a production tailnet. A local
one is a single container: `docker run -p 8080:8080 headscale/headscale:latest`.

## Project layout

- `src/app/(app)/` - one folder per console page; server actions live next to
  their page as `actions.ts`.
- `src/lib/` - Headscale API client (`headscale/`), auth/RBAC (`auth/`,
  `authz/`, `rbac/`), SQLite store (`db/`), policy model (`policy/`).
- `src/components/ui/` - the design-system primitives. Build with these; do not
  hand-roll one-off buttons, dialogs, tabs, or panels.

## Ground rules

- **Read `AGENTS.md` first.** The pinned Next.js version has breaking changes;
  the guides under `node_modules/next/dist/docs/` are the source of truth.
- **Design system.** Graphite/ink neutrals plus a single beacon-amber accent.
  No blue. Geist for UI, Geist Mono for data. Status colors are functional
  only. If a change fights this, it will be asked to change.
- **Every mutation** goes through a server action that is RBAC-gated
  (`sessionCan`/`requireCan`) and audit-logged. No exceptions.
- **Headscale stays the source of truth** for tailnet state. Headtower's SQLite
  stores only what Headscale cannot: accounts, sessions, audit, node metadata.
- **Honest UI.** Error states explain what failed and how to fix it. Never show
  a control that cannot take effect.

## Pull requests

- Keep commits to a single short subject line, roughly ten words. No trailers.
- `pnpm build` and `pnpm lint` must pass.
- Describe what changed and why; screenshots for anything visual.
- Small, focused PRs review faster than big ones.

## Reporting bugs

Open an issue with your Headscale version, Headtower version (bottom of the
sidebar), deployment method, and reproduction steps. For security problems see
[SECURITY.md](./SECURITY.md) - do not open a public issue.
