/**
 * Policy revision store - saved ACL documents and their deploy state (server-only).
 *
 * Headscale's policy API is `GET` and `PUT` of one current document; it keeps no
 * history and offers no versions. So an earlier policy exists only if Headtower
 * kept it, which is what this table is for: author a document, save it here,
 * and push whichever stored version you want to the control plane.
 *
 * The digest of the document is the row's identity (UNIQUE in the DDL). Saving
 * or deploying a document that is already stored touches the existing row rather
 * than adding a copy - the operator asked for "create a revision if it does not
 * exist yet" - so rolling back and forward again leaves two rows, not four. The
 * *sequence* of who pushed what and when belongs to `audit_log`, the append-only
 * trail; this table holds state.
 *
 * Read path (Server Components):
 *   listRevisions()            newest first, with document bodies
 *   getRevision(id)            one row, or null
 *
 * Write path (Server Actions, RBAC-gated + audited):
 *   rememberRevision(...)      insert unless the digest is already stored
 *   markDeployed(id)           stamp a successful push to Headscale
 *   updateNote(id, note)       rename
 *   deleteRevision(id)         remove one row
 *
 * Like the other helpers here it imports `./client` + `./schema` directly (not
 * the `@/lib/db` barrel) to avoid an import cycle, and is SERVER-ONLY by virtue
 * of `./client` pulling in `node:sqlite`.
 */

import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "./client";
import { policyRevision, type PolicyRevisionRow } from "./schema";
import { normalizeNote } from "./policy-revision-types";

/**
 * SHA-256 of a policy document, hex.
 *
 * Deliberately over the RAW bytes, with no normalisation: two documents that
 * differ only in whitespace or key order really are different documents to
 * review, and collapsing them would silently lose an edit an operator can see in
 * the diff. It also keeps the digest comparable with what Headscale returns
 * verbatim.
 */
export function digestOf(document: string): string {
  return createHash("sha256").update(document, "utf8").digest("hex");
}

/** Every stored revision, newest first. */
export async function listRevisions(): Promise<PolicyRevisionRow[]> {
  return db.select().from(policyRevision).orderBy(desc(policyRevision.createdAt));
}

/** One revision by id, or null when it has been deleted meanwhile. */
export async function getRevision(id: number): Promise<PolicyRevisionRow | null> {
  const row = await db
    .select()
    .from(policyRevision)
    .where(eq(policyRevision.id, id))
    .get();
  return row ?? null;
}

/** One revision by document digest, or null. */
export async function findByDigest(digest: string): Promise<PolicyRevisionRow | null> {
  const row = await db
    .select()
    .from(policyRevision)
    .where(eq(policyRevision.digest, digest))
    .get();
  return row ?? null;
}

export interface RememberResult {
  row: PolicyRevisionRow;
  /** False when this exact document was already stored. */
  created: boolean;
}

/**
 * Store a document unless its digest is already known.
 *
 * Idempotent by design, which is what makes it safe to call from a render path
 * (capturing the live policy as a baseline) as well as from a Server Action: a
 * double invocation cannot produce a duplicate, because the digest is unique.
 * Returns the row either way plus whether it was new, so a caller can say
 * "already saved as #7" instead of pretending it wrote something.
 */
export async function rememberRevision(input: {
  document: string;
  actor: string;
  note?: string | null;
  /** Stamp it as deployed in the same step (the deploy path does this). */
  deployedAt?: Date | null;
}): Promise<RememberResult> {
  const digest = digestOf(input.document);
  const existing = await findByDigest(digest);
  if (existing) {
    // Never overwrite the note of a row that already exists: the first label an
    // operator gave a document is the one they will recognise it by. Renaming is
    // its own explicit action.
    if (input.deployedAt) await markDeployed(existing.id, input.deployedAt);
    return { row: (await getRevision(existing.id)) ?? existing, created: false };
  }

  await db.insert(policyRevision).values({
    document: input.document,
    digest,
    actor: input.actor,
    note: normalizeNote(input.note),
    lastDeployedAt: input.deployedAt ?? null,
  });

  // Read the row back by digest rather than trusting `.returning()`: the digest
  // is unique, so this is exact, and it keeps the store free of assumptions
  // about what this driver returns from an insert.
  const stored = await findByDigest(digest);
  if (!stored) throw new Error("policy revision vanished immediately after insert");
  return { row: stored, created: true };
}

/** Stamp a successful push to the control plane. */
export async function markDeployed(id: number, at: Date = new Date()): Promise<void> {
  await db
    .update(policyRevision)
    .set({ lastDeployedAt: at })
    .where(eq(policyRevision.id, id));
}

/**
 * Set or clear a revision's label. Returns false when the row is gone.
 *
 * Existence is checked with a read rather than by inspecting an update result:
 * the shape of that result is driver-specific, and a wrong guess would report
 * success for a row that was never there.
 */
export async function updateNote(id: number, note: string | null): Promise<boolean> {
  if (!(await getRevision(id))) return false;
  await db
    .update(policyRevision)
    .set({ note: normalizeNote(note) })
    .where(eq(policyRevision.id, id));
  return true;
}

/** Remove one revision. Returns false when it was already gone. */
export async function deleteRevision(id: number): Promise<boolean> {
  if (!(await getRevision(id))) return false;
  await db.delete(policyRevision).where(eq(policyRevision.id, id));
  return true;
}
