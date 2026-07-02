# Headtower overall improvement plan (2026-07-02)

Source: ultracode audit (5 dimensions, verified) + research on Headplane, headscale-admin, headscale-ui, Termix.
All four tracks approved by owner. Deferred (do NOT build): dynamic RBAC roles, alerting subsystem, dashboard drag-reorder, network topology graph.

## Execution waves (orchestrated via workflows, mixed Opus/Sonnet high effort)

### Wave 1 - foundation, disjoint parallel agents
- Caching: wrap `getConfig`/`loadSession`/`getSession` in React `cache()` (lib-only; dedupes the 15-20x per-render re-runs). `src/lib/config/index.ts`, `src/lib/auth/*`, `src/lib/authz/index.ts`.
- Pre-auth keys: expose `aclTags` in both create flows; add delete action (`preAuthKeys.remove`, 0.29+ with fallback); client-side owner/status filter on list; `preAuthKeys.listAll()` on resource layer replacing the hand-rolled fan-out in settings page + dashboard.
- Routes: "Approve all pending" (per-node + global) looping existing approvals; shrink approve/revoke read-modify-write race by passing board-loaded routes.
- Users: create dialog gains displayName/email/pictureUrl (no user-update endpoint exists, so create-time is the only chance); `/users/[id]` detail page with rename/delete + owned nodes; node count links to `/machines?user=<name>` (param implemented in wave 2).
- Small UI fixes: avatar fallback contrast (account-menu.tsx:153), outlier Cancel variant (member-row.tsx:170), theme-aware donut ramp, trim accent presets to honor the no-blue design law.
- Node-actions dedup: extract shared RenameForm/TagsForm/ExpireForm/DeleteForm module from the ~90% duplicated `node-actions.tsx`/`node-actions-menu.tsx`; thin wrappers; detail page renders one action set.
- Gate: `pnpm build` + `tsc --noEmit`; fixer loop.

### Wave 2 - machines backbone + system-wide conventions
- Machines mega-task (one agent, sequential): shared `<MachinesToolbar>` + `useMachinesFilter` with URL-backed query/status (+ `user` and `tag` params for deep links); bulk selection (header checkbox, shift-click range, floating action bar: tag/expire/delete with partial-failure reporting); `next/dynamic` the add-device dialog.
- Toast system: one design-system primitive; wire into node-actions, routes board, members, users.
- Error classifier: collapse the 5 drifted `errors.ts` copies into one shared `describeHeadscaleError`.
- Empty/error panel consolidation: `EmptyState` tone variant; standardize convention.
- SegmentedTabs primitive replacing ~5 hand-rolled tablists.
- Gate + fixer.

### Wave 3 - feature steals (Headplane/Termix/headscale-admin)
- Dashboard stat tiles deep-link to pre-filtered machines (uses wave-2 URL filters); filter pills on machines.
- Type-to-confirm scaled to blast radius (name for single delete, `DELETE <n>` for bulk).
- Show-secret-once panel with ready-made `tailscale up` command after pre-auth key creation.
- Enrollment deep link: registration route with prepopulated node key.
- Node metadata in our SQLite: notes/labels/environment, edit dialog, chips on list/detail (explicitly "not pushed to Headscale").
- API-key self-lockout guard (UI-disabled + server-enforced for the key Headtower itself uses).
- Command palette: quick actions actually act (auto-open dialogs via query flag); device+action one-gesture flow with recents (Termix).
- Mobile nav drawer; ACL token autocomplete from policy definitions; tag suggestions from tagOwners+in-use tags.
- Gate + fixer.

### Wave 4 - ACL power trio (Headplane differentiator)
- Side-by-side diff preview tab before save.
- Live advisory-only semantic linter (undeclared group/tag refs, unknown users vs live data; location chips; never blocks save).
- Reachability tester: src (node/user/tag/group) x dst x port/protocol, pure server-side eval; when dirty, evaluate saved AND edited policy and show the delta ("would NEWLY ALLOW/DENY").
- Dirty-state save guard (beforeunload + in-app nav blocker + Cmd-S).
- Gate + fixer.

### Wave 5 - verify + review
- Full build, chrome-devtools live walkthrough of every changed flow, code-review workflow (adversarial verify), fixes.
- Deploy to droplet only after local verification; confirm with owner before push.

## Full ranked audit map (reference)
Tier 1: caching, avatar, aclTags, preauth delete, approve-all, dynamic import, user create fields.
Tier 2: bulk actions, /users/[id], node-actions dedup, machines toolbar+URL filters.
Tier 3: toasts, error classifier, empty-state consolidation, preauth listAll, SegmentedTabs, ACL autocomplete, donut ramp, mobile drawer.
Tier 4: tag suggestions, preauth filter, accent trim, palette actions, cancel variant, routes race.
