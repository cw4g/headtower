/**
 * Authorization + audit glue for Server Actions (server-only).
 *
 * One place to answer "may this session run this mutation?" and to write the
 * matching audit entry, so every mutating action enforces RBAC and records
 * history the same way. It composes the three primitives it sits on top of:
 *
 *   requireSession()  @/lib/auth   - the authenticated principal (or throw)
 *   can(role, cap)    @/lib/rbac   - the capability check
 *   recordAudit(...)  @/lib/audit  - the append-only trail
 *
 * Usage in a "use server" action:
 *
 *   const gate = await authorize("machines.write");
 *   if (!gate.ok) return { status: "error", error: gate.reason };
 *   // ... perform the mutation against the control plane ...
 *   await audit(gate.session, {
 *     action: "node.rename", targetType: "node", targetId: id, targetName: name,
 *   });
 *
 * For read-time UI gating in Server Components use {@link sessionCan} /
 * {@link sessionCapabilities}; these never throw and treat "no session" as "no",
 * so a view can hide or disable controls the role lacks.
 *
 * SERVER-ONLY: composes server-only modules and must never be imported into a
 * client component. Resolve capabilities here and pass plain booleans to the UI.
 */

import { getSession, requireSession, type Session } from "@/lib/auth";
import { recordAudit, type RecordAuditInput } from "@/lib/audit";
import { CAPABILITIES, ROLE_LABELS, can, type Capability } from "@/lib/rbac";

if (typeof window !== "undefined") {
  throw new Error(
    "@/lib/authz is server-only and must not be imported into client components. " +
      "Resolve capabilities on the server and pass plain booleans to the client.",
  );
}

/** Outcome of an {@link authorize} gate: the session, or why it was denied. */
export type AuthzResult =
  | { ok: true; session: Session }
  | { ok: false; reason: string };

/**
 * Gate a mutation on a capability. Requires an authenticated session (delegating
 * to `requireSession`, which throws when there is none - the routes are already
 * gated, so this is a defensive backstop) and confirms the role holds
 * `capability`. A denial returns `ok: false` with an operator-facing reason the
 * action can surface inline in its own error shape, instead of throwing.
 */
export async function authorize(capability: Capability): Promise<AuthzResult> {
  const session = await requireSession();
  if (!can(session.role, capability)) {
    return {
      ok: false,
      reason: `Your role (${ROLE_LABELS[session.role]}) isn't allowed to do this.`,
    };
  }
  return { ok: true, session };
}

/**
 * Record an audit entry for a completed mutation, stamping the actor from the
 * session. Best-effort by design: a failed audit write is logged but never
 * propagates, so a flaky local store can't undo or mask a change the control
 * plane already accepted (e.g. swallowing a freshly minted key's only reveal).
 */
export async function audit(
  session: Session,
  entry: Omit<RecordAuditInput, "actor">,
): Promise<void> {
  try {
    await recordAudit({ actor: actorLabel(session), ...entry });
  } catch (err) {
    console.error(`audit: failed to record "${entry.action}"`, err);
  }
}

/** The stable label written to the audit trail for a principal. */
export function actorLabel(session: Session): string {
  return session.user.name;
}

/**
 * Whether the current session holds `capability`, for hiding or disabling write
 * controls in Server Components. Never throws; an absent session resolves "no".
 */
export async function sessionCan(capability: Capability): Promise<boolean> {
  const session = await getSession();
  return session ? can(session.role, capability) : false;
}

/**
 * The full capability map for the current session as plain booleans, safe to
 * pass across the server/client boundary (e.g. to the command palette). Every
 * capability is `false` when unauthenticated.
 */
export async function sessionCapabilities(): Promise<Record<Capability, boolean>> {
  const session = await getSession();
  const role = session?.role ?? null;
  const map = {} as Record<Capability, boolean>;
  for (const capability of CAPABILITIES) {
    map[capability] = role ? can(role, capability) : false;
  }
  return map;
}
