# Headtower - build notes (north star)

A ground-up, original Headscale control UI. **No Headplane code or structure** -
only the product knowledge from building the earlier fork informs *what* to build,
never *how* it was built there. This file is the single source of direction for
the rebuild; keep it current.

## Vision

**Headtower is an operator's console for a Headscale tailnet**, not a marketing
dashboard. Headscale is a control plane for a private mesh network, so the UI
behaves like an instrument panel: it *reports* state precisely rather than
decorating it. Three commitments:

- **Legible over pretty.** Every node, IP, route, and count is real data shown
  cleanly. Mono + tabular figures so readouts align like an instrument.
- **Keyboard-first, fast.** Command palette, quick filters, no modal mazes.
- **Honest about state.** Online/offline/expiring is obvious at a glance; motion
  reports status, it never just delights.

Distinct from Headplane (generic monochrome SaaS) and Tailscale's admin (clean
blue SaaS). Our identity is the **schematic control console**.

## Design system (see src/app/globals.css)

- **Aesthetic:** schematic, hairline-ruled, grid-aware (`.grid-field`),
  function-forward (the strongest 2026 anti-generic direction).
- **Type:** Geist Sans for UI, **Geist Mono for all data** (`.data` / `.tnum`).
- **Color:** graphite ink neutrals (never pure black) + ONE signal accent,
  **beacon amber** (`beacon-500 #f5b544`, the light in the tower). Status colors
  (online emerald, warn orange, critical rose) are functional only - the accent
  is never used for status.
- **Surfaces:** semantic tokens `canvas / surface / surface-2 / line / line-strong
  / ink / ink-muted / ink-faint`, theme-flipped via the `.dark` class. Dark-first.
- **Signature element:** a live **tailnet coverage view** on the dashboard - the
  control tower at center, nodes as points, online/offline as signal strength.
  This is the one bold thing; everything else stays quiet.
- Brand mark: the beacon-cone logo (dark rounded square, light cone + beacon dot).

## Architecture (Next.js 16 App Router, React 19, Tailwind 4)

> Next 16 has breaking changes vs older training data - consult
> `node_modules/next/dist/docs/` before writing Next-specific server code
> (async params/searchParams, caching directives, route handlers).

- **RSC-first.** Data fetching in Server Components; `"use client"` only on leaf
  interactive nodes. Server Actions for mutations, `revalidatePath` after.
- **Route-segment ownership:** each segment owns its `layout/loading/error` +
  local components.
- Layout:
  - `src/app/` - route segments (dashboard, machines, users, acls, routes, dns,
    audit, settings) under an authed app-shell layout group.
  - `src/lib/headscale/` - our own Headscale REST client (`/api/v1/...`):
    nodes, users, preAuthKeys, apiKeys, routes, policy, dns. Typed, no codegen.
  - `src/lib/config/` - config from env/file (Headscale url + api key, oidc).
  - `src/lib/auth/` - session, API-key login, OIDC (Pocket ID / generic).
  - `src/lib/db/` - small local store for Headtower-only state (users/roles,
    audit log, sessions). Headscale stays the source of truth for tailnet data.
  - `src/components/ui/` - design-system primitives (Button, Card, Table, Chip,
    StatusDot, Field, Dialog, CommandPalette, ...).
  - `src/components/` - composed app pieces (AppShell, NodeRow, CoverageView).

## Feature roadmap (build order)

1. **Foundation** - design system [done], Headscale client, config, app shell.
2. **Machines** - list (the core readout), detail, tags/routes/expiry, bulk ops.
3. **Dashboard** - coverage signature + status readouts (not a stat-card grid).
4. **Users** - list, create, OIDC link, roles/RBAC, profile pics.
5. **ACLs** - visual editor (access + SSH rules, auto-approvers, groups, tags,
   hosts) + JSON view + reachability + linter.
6. **Routes / DNS** - approvals + auto-approvers; nameservers, MagicDNS, split DNS.
7. **Audit** - filters, CSV export, pagination.
8. **Settings** - pre-auth keys, API keys, diagnostics, update indicator.
9. **Auth** - API key + OIDC + proxy-auth.
10. **Agent** - fresh Go sidecar (device version/OS/endpoints) - separate, later.
11. **Docs** - Nextra (Next.js + markdown), original content + IA.

New-vision extras to weave in (not in the fork): live coverage view, command
palette as the primary nav, keyboard ops, adaptive density.

## Done so far

- Scaffold: Next 16 + React 19 + Tailwind 4 + TS (src/app, Geist + Geist Mono).
- Design system in globals.css; dark-first root layout; Headtower metadata.

## Conventions

- pnpm only. No Headplane code/strings/assets anywhere.
- Mono + tabular for data; beacon accent sparingly; status colors functional only.
- Server Components default; client components are small leaves.
