/**
 * ACL tag normalisation for pre-auth key creation.
 *
 * Shared by the create dialog (client, via {@link TokenInput}), its Server
 * Action, and the Machines "Add device" create-key flow, which mints the same
 * kind of key. Framework-agnostic (no "use client"/"use server") so both
 * sides of the boundary can import it.
 */

/** Trim, `tag:`-prefix, and de-duplicate a list of ACL tags (order preserved). */
export function normalizeAclTags(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of raw) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const tag = trimmed.startsWith("tag:") ? trimmed : `tag:${trimmed}`;
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}
