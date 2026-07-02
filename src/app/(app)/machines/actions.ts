"use server";

/**
 * Server Actions for the Machines view.
 *
 * Each mutation runs on the server, hits the Headscale admin API through our
 * nodes client, then revalidates both the list and the affected detail path so
 * the console reflects the new state on the next render. Failures come back as a
 * short, operator-facing reason rather than throwing into the client.
 */

import { revalidatePath } from "next/cache";
import { nodes } from "@/lib/headscale";
import { audit, authorize } from "@/lib/authz";
import { can } from "@/lib/rbac";
import { deleteNodeMetadata, deleteNodeMetadataMany } from "@/lib/db";
import { describeHeadscaleError } from "./errors";

/** Outcome of a node mutation, shaped for the dialog's inline error handling. */
export interface NodeActionResult {
  status: "success" | "error";
  /** Present only when `status === "error"`. */
  error?: string;
}

/** Refresh the machines list and this node's detail after a mutation. */
function revalidateNode(id: string): void {
  revalidatePath("/machines");
  revalidatePath(`/machines/${id}`);
}

// Tags are `tag:`-prefixed identifiers with no whitespace; the control plane is
// the final word on what policy permits, so this only guards the obvious shape.
const TAG_RE = /^tag:\S+$/;

/** Set a node's operator-facing display (given) name. */
export async function renameNode(
  id: string,
  name: string,
): Promise<NodeActionResult> {
  const gate = await authorize("machines.write");
  if (!gate.ok) {
    return { status: "error", error: gate.reason };
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { status: "error", error: "Enter a display name." };
  }
  if (trimmed.length > 63) {
    return { status: "error", error: "Name must be 63 characters or fewer." };
  }

  try {
    await nodes.rename(id, trimmed);
  } catch (err) {
    return { status: "error", error: describeHeadscaleError(err) };
  }

  await audit(gate.session, {
    action: "node.rename",
    targetType: "node",
    targetId: id,
    targetName: trimmed,
    detail: { name: trimmed },
  });
  revalidateNode(id);
  return { status: "success" };
}

/**
 * Replace a node's ACL tags with the complete set provided. An empty array
 * clears every tag. Each entry must be `tag:`-prefixed.
 */
export async function setNodeTags(
  id: string,
  tags: string[],
): Promise<NodeActionResult> {
  const gate = await authorize("machines.write");
  if (!gate.ok) {
    return { status: "error", error: gate.reason };
  }

  // Normalise: trim, drop blanks, dedupe while preserving order.
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag) continue;
    if (!TAG_RE.test(tag)) {
      return { status: "error", error: "Tags must be tag:-prefixed." };
    }
    if (seen.has(tag)) continue;
    seen.add(tag);
    clean.push(tag);
  }

  try {
    await nodes.setTags(id, clean);
  } catch (err) {
    return { status: "error", error: describeHeadscaleError(err) };
  }

  await audit(gate.session, {
    action: "node.setTags",
    targetType: "node",
    targetId: id,
    detail: { tags: clean },
  });
  revalidateNode(id);
  return { status: "success" };
}

/** Expire a node's key immediately, forcing it to re-authenticate. */
export async function expireNode(id: string): Promise<NodeActionResult> {
  const gate = await authorize("machines.write");
  if (!gate.ok) {
    return { status: "error", error: gate.reason };
  }

  try {
    await nodes.expire(id);
  } catch (err) {
    return { status: "error", error: describeHeadscaleError(err) };
  }

  await audit(gate.session, {
    action: "node.expire",
    targetType: "node",
    targetId: id,
  });
  revalidateNode(id);
  return { status: "success" };
}

/** Permanently remove a node from the tailnet. */
export async function deleteNode(id: string): Promise<NodeActionResult> {
  const gate = await authorize("machines.write");
  if (!gate.ok) {
    return { status: "error", error: gate.reason };
  }

  try {
    await nodes.remove(id);
  } catch (err) {
    return { status: "error", error: describeHeadscaleError(err) };
  }

  // The node is gone from the control plane; drop its Headtower-local metadata
  // too so a future node reusing this id can't inherit stale notes/labels.
  // Best-effort: a cleanup failure must not undo a delete the control plane
  // already accepted.
  try {
    await deleteNodeMetadata(id);
  } catch (err) {
    console.error(`deleteNode: metadata cleanup failed for ${id}`, err);
  }

  await audit(gate.session, {
    action: "node.delete",
    targetType: "node",
    targetId: id,
  });
  // The node is gone: refresh the list and drop the now-dead detail path.
  revalidateNode(id);
  return { status: "success" };
}

/* ------------------------------------------------------------------ *
 * Bulk mutations - the floating action bar loops the per-id primitives
 * above over a selection, re-checking RBAC per node and collecting
 * per-node outcomes so a partial failure surfaces the exact rows that
 * didn't take rather than failing the whole batch.
 * ------------------------------------------------------------------ */

/** Hard ceiling on a single bulk op, matching the audit store's page cap. */
const BULK_LIMIT = 200;

/** One failed node in a bulk op, keyed by id so the bar can name the row. */
export interface BulkFailure {
  id: string;
  error: string;
}

/** Aggregate outcome of a bulk op: how many took, and which rows didn't. */
export interface BulkActionResult {
  succeeded: number;
  failed: number;
  errors: BulkFailure[];
}

/** Reject an out-of-range selection as an all-failed result with one reason. */
function rejectSelection(ids: string[], reason: string): BulkActionResult {
  return {
    succeeded: 0,
    failed: ids.length,
    errors: ids.map((id) => ({ id, error: reason })),
  };
}

/** De-dupe ids while preserving order; drops blanks. */
function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Expire the keys of every selected node, collecting per-node outcomes. */
export async function bulkExpireNodes(
  rawIds: string[],
): Promise<BulkActionResult> {
  const gate = await authorize("machines.write");
  if (!gate.ok) return rejectSelection(rawIds, gate.reason);

  const ids = uniqueIds(rawIds);
  if (ids.length === 0) return { succeeded: 0, failed: 0, errors: [] };
  if (ids.length > BULK_LIMIT) {
    return rejectSelection(ids, `Select ${BULK_LIMIT} or fewer machines.`);
  }

  const errors: BulkFailure[] = [];
  let succeeded = 0;
  for (const id of ids) {
    // Per-node RBAC re-check: role can't drift mid-loop, but re-gating each
    // node keeps the batch honest if the capability model ever grows per-node.
    if (!can(gate.session.role, "machines.write")) {
      errors.push({ id, error: "Not allowed." });
      continue;
    }
    try {
      await nodes.expire(id);
      succeeded++;
    } catch (err) {
      errors.push({ id, error: describeHeadscaleError(err) });
    }
  }

  await audit(gate.session, {
    action: "node.bulkExpire",
    targetType: "node",
    detail: { ids, count: ids.length, succeeded, failed: errors.length },
  });
  revalidatePath("/machines");
  return { succeeded, failed: errors.length, errors };
}

/**
 * Set tags on every selected node. Each item carries the complete tag set for
 * that node, so the bar can implement "add tag" as a per-node union against the
 * current tags while the server still runs the same replace-all `setTags`.
 */
export async function bulkSetNodeTags(
  items: { id: string; tags: string[] }[],
): Promise<BulkActionResult> {
  const gate = await authorize("machines.write");
  const rawIds = items.map((i) => i.id);
  if (!gate.ok) return rejectSelection(rawIds, gate.reason);

  if (items.length === 0) return { succeeded: 0, failed: 0, errors: [] };
  if (items.length > BULK_LIMIT) {
    return rejectSelection(rawIds, `Select ${BULK_LIMIT} or fewer machines.`);
  }

  const errors: BulkFailure[] = [];
  let succeeded = 0;
  for (const { id, tags } of items) {
    if (!can(gate.session.role, "machines.write")) {
      errors.push({ id, error: "Not allowed." });
      continue;
    }
    // Normalise: trim, drop blanks, dedupe while preserving order.
    const seen = new Set<string>();
    const clean: string[] = [];
    let invalid = false;
    for (const raw of tags) {
      const tag = raw.trim();
      if (!tag) continue;
      if (!TAG_RE.test(tag)) {
        invalid = true;
        break;
      }
      if (seen.has(tag)) continue;
      seen.add(tag);
      clean.push(tag);
    }
    if (invalid) {
      errors.push({ id, error: "Tags must be tag:-prefixed." });
      continue;
    }
    try {
      await nodes.setTags(id, clean);
      succeeded++;
    } catch (err) {
      errors.push({ id, error: describeHeadscaleError(err) });
    }
  }

  await audit(gate.session, {
    action: "node.bulkSetTags",
    targetType: "node",
    detail: {
      ids: rawIds,
      count: items.length,
      succeeded,
      failed: errors.length,
    },
  });
  revalidatePath("/machines");
  return { succeeded, failed: errors.length, errors };
}

/** Permanently remove every selected node, collecting per-node outcomes. */
export async function bulkDeleteNodes(
  rawIds: string[],
): Promise<BulkActionResult> {
  const gate = await authorize("machines.write");
  if (!gate.ok) return rejectSelection(rawIds, gate.reason);

  const ids = uniqueIds(rawIds);
  if (ids.length === 0) return { succeeded: 0, failed: 0, errors: [] };
  if (ids.length > BULK_LIMIT) {
    return rejectSelection(ids, `Select ${BULK_LIMIT} or fewer machines.`);
  }

  const errors: BulkFailure[] = [];
  const removed: string[] = [];
  let succeeded = 0;
  for (const id of ids) {
    if (!can(gate.session.role, "machines.write")) {
      errors.push({ id, error: "Not allowed." });
      continue;
    }
    try {
      await nodes.remove(id);
      removed.push(id);
      succeeded++;
    } catch (err) {
      errors.push({ id, error: describeHeadscaleError(err) });
    }
  }

  // Clean up Headtower-local metadata for the nodes that were actually removed.
  // Best-effort: never let a cleanup failure mask a delete the control plane
  // already accepted.
  try {
    await deleteNodeMetadataMany(removed);
  } catch (err) {
    console.error("bulkDeleteNodes: metadata cleanup failed", err);
  }

  await audit(gate.session, {
    action: "node.bulkDelete",
    targetType: "node",
    detail: { ids, count: ids.length, succeeded, failed: errors.length },
  });
  revalidatePath("/machines");
  return { succeeded, failed: errors.length, errors };
}
