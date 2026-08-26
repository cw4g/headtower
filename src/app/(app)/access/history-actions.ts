"use server";

/**
 * Server Actions for the policy revision history.
 *
 * The point of the history is that Headtower separates two verbs Headscale does
 * not: SAVE (keep a document here, no effect on the tailnet) and DEPLOY (push a
 * stored document to the control plane). Headscale's API is `GET`/`PUT` of one
 * current document with no versions, so an earlier policy exists only because we
 * kept it - see `@/lib/db/policy-revisions`.
 *
 * All four gate on `acls.write` and write an audit entry, per the project rule
 * that every mutation is RBAC-gated and audited. Saving a draft changes nothing
 * in the tailnet and could arguably be cheaper to authorise, but a second
 * capability would ripple through the whole role matrix for little gain.
 */

import { revalidatePath } from "next/cache";
import { policy } from "@/lib/headscale";
import { actorLabel, audit, authorize } from "@/lib/authz";
import {
  deleteRevision,
  getRevision,
  markDeployed,
  rememberRevision,
  updateRevisionNote,
} from "@/lib/db";
import { describeHeadscaleError } from "./errors";

/** Result shape shared by the history actions, for the client panel. */
export interface RevisionActionState {
  status: "success" | "error";
  error?: string;
  /** The row the action acted on, when there is one. */
  revisionId?: number;
  /**
   * Set when a save found the document already stored, so the panel can say
   * "already saved as #7" instead of implying it wrote a new row.
   */
  alreadyStored?: boolean;
  /** Control-plane timestamp after a successful deploy. */
  updatedAt?: string | null;
}

/** Keep the editor's document as a revision. Does not touch the tailnet. */
export async function saveRevision(
  document: string,
  note?: string | null,
): Promise<RevisionActionState> {
  if (typeof document !== "string" || document.trim() === "") {
    return { status: "error", error: "The policy document is empty." };
  }

  const gate = await authorize("acls.write");
  if (!gate.ok) return { status: "error", error: gate.reason };

  const { row, created } = await rememberRevision({
    document,
    actor: actorLabel(gate.session),
    note,
  });

  // Audited even when nothing was written: "tried to save a document we already
  // had" is a real thing to see in the trail, and silence would be misleading.
  await audit(gate.session, {
    action: "acl.revision.save",
    targetType: "policy",
    targetId: String(row.id),
    targetName: row.note ?? undefined,
    detail: { bytes: document.length, digest: row.digest, created },
  });

  revalidatePath("/access");
  return {
    status: "success",
    revisionId: row.id,
    alreadyStored: !created,
  };
}

/**
 * Push a stored revision to Headscale.
 *
 * Headscale validates the document authoritatively and rejects an invalid one
 * with a typed error, which is relayed as-is rather than guessed at - the same
 * contract as `savePolicy`. Only a successful PUT stamps `lastDeployedAt`, so a
 * rejected rollback never claims to have happened.
 */
export async function deployRevision(id: number): Promise<RevisionActionState> {
  const gate = await authorize("acls.write");
  if (!gate.ok) return { status: "error", error: gate.reason };

  const revision = await getRevision(id);
  if (!revision) {
    return { status: "error", error: "That revision no longer exists." };
  }

  let updatedAt: string | null = null;
  try {
    const saved = await policy.set(revision.document);
    updatedAt = saved?.updatedAt ?? null;
  } catch (err) {
    return { status: "error", error: describeHeadscaleError(err) };
  }

  await markDeployed(revision.id);

  await audit(gate.session, {
    action: "acl.deploy",
    targetType: "policy",
    targetId: String(revision.id),
    targetName: revision.note ?? undefined,
    detail: { digest: revision.digest, bytes: revision.document.length, updatedAt },
  });

  revalidatePath("/access");
  return { status: "success", revisionId: revision.id, updatedAt };
}

/** Set or clear a revision's label. */
export async function renameRevision(
  id: number,
  note: string | null,
): Promise<RevisionActionState> {
  const gate = await authorize("acls.write");
  if (!gate.ok) return { status: "error", error: gate.reason };

  if (!(await updateRevisionNote(id, note))) {
    return { status: "error", error: "That revision no longer exists." };
  }

  await audit(gate.session, {
    action: "acl.revision.rename",
    targetType: "policy",
    targetId: String(id),
    targetName: note ?? undefined,
  });

  revalidatePath("/access");
  return { status: "success", revisionId: id };
}

/**
 * Forget a revision.
 *
 * Deliberately allowed even for the document that is currently live: deleting
 * the row does not change the tailnet, and the operator asked to be able to
 * clear the list themselves. What it does cost is the rollback anchor, which is
 * why the panel says so at the point of asking.
 */
export async function removeRevision(id: number): Promise<RevisionActionState> {
  const gate = await authorize("acls.write");
  if (!gate.ok) return { status: "error", error: gate.reason };

  const revision = await getRevision(id);
  if (!revision || !(await deleteRevision(id))) {
    return { status: "error", error: "That revision no longer exists." };
  }

  await audit(gate.session, {
    action: "acl.revision.delete",
    targetType: "policy",
    targetId: String(id),
    targetName: revision.note ?? undefined,
    detail: { digest: revision.digest, wasDeployed: revision.lastDeployedAt != null },
  });

  revalidatePath("/access");
  return { status: "success", revisionId: id };
}
