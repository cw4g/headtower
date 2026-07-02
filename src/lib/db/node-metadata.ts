/**
 * Node metadata store - Headtower-local annotations on Headscale nodes (server-only).
 *
 * Notes, an environment tag, and free labels an operator hangs on a node to
 * organise a fleet. This is Headtower's own state: it lives in this SQLite
 * database, keyed by the Headscale node id, and is NEVER pushed to Headscale.
 * There is no control-plane foreign key to cascade from, so the node-delete
 * Server Actions call {@link deleteNodeMetadata} / {@link deleteNodeMetadataMany}
 * to clean the row up when a node is removed.
 *
 * Read path (both used by Server Components):
 *   getNodeMetadata(nodeId)   resolve one node's annotations (empty when none)
 *   getNodeMetadataMap([ids]) map many nodes at once, for the list rows
 *
 * Write path (Server Actions, RBAC-gated + audited):
 *   upsertNodeMetadata(...)   insert or replace a node's annotations
 *   deleteNodeMetadata(id)    clear a node's annotations entirely
 *   deleteNodeMetadataMany    bulk clear (node bulk-delete cleanup)
 *
 * Like the other helpers in this directory it imports `./client` + `./schema`
 * directly (not the `@/lib/db` barrel) to avoid an import cycle, and is
 * SERVER-ONLY by virtue of `./client` pulling in `node:sqlite`.
 */

import { eq, inArray } from "drizzle-orm";
import { db } from "./client";
import { nodeMetadata, type NodeMetadataRow } from "./schema";
import {
  EMPTY_NODE_METADATA,
  normalizeEnvironment,
  normalizeLabels,
  normalizeNote,
  type NodeEnvironment,
  type NodeMetadataValue,
} from "./node-metadata-types";

/** The fields an operator may set on a node. Absent = cleared. */
export interface NodeMetadataInput {
  note?: string | null;
  environment?: NodeEnvironment | null;
  labels?: string[];
}

/** Turn a stored row into the resolved, UI-facing value (defensively parsed). */
function rowToValue(row: NodeMetadataRow): NodeMetadataValue {
  return {
    note: normalizeNote(row.note),
    environment: normalizeEnvironment(row.environment),
    labels: normalizeLabels(Array.isArray(row.labels) ? row.labels : []),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.getTime()
        : row.updatedAt != null
          ? Number(row.updatedAt)
          : null,
  };
}

/**
 * Resolve one node's annotations. Returns an empty value (not null) when the
 * node has no row, so callers can render uniformly. Best-effort: an unavailable
 * store resolves to empty rather than throwing into a detail render.
 */
export async function getNodeMetadata(
  nodeId: string,
): Promise<NodeMetadataValue> {
  try {
    const row = await db
      .select()
      .from(nodeMetadata)
      .where(eq(nodeMetadata.nodeId, nodeId))
      .get();
    return row ? rowToValue(row) : EMPTY_NODE_METADATA;
  } catch {
    return EMPTY_NODE_METADATA;
  }
}

/**
 * Resolve annotations for many nodes at once, as a `nodeId -> value` map. Pass
 * the ids you care about to scope the read; omit them to load every row (the
 * table is small - one row per annotated node). Only nodes that actually have a
 * row appear in the map, so the list can cheaply check `map.get(id)`.
 *
 * Best-effort: an unavailable store yields an empty map rather than failing the
 * whole list render.
 */
export async function getNodeMetadataMap(
  nodeIds?: readonly string[],
): Promise<Map<string, NodeMetadataValue>> {
  const map = new Map<string, NodeMetadataValue>();
  try {
    // An explicit empty selection has nothing to fetch.
    if (nodeIds && nodeIds.length === 0) return map;
    const rows: NodeMetadataRow[] = nodeIds
      ? await db
          .select()
          .from(nodeMetadata)
          .where(inArray(nodeMetadata.nodeId, [...nodeIds]))
      : await db.select().from(nodeMetadata);
    for (const row of rows) map.set(row.nodeId, rowToValue(row));
  } catch {
    // Best-effort: fall through to whatever was gathered (possibly nothing).
  }
  return map;
}

/**
 * Insert or replace a node's annotations. The input is normalised here (note
 * trimmed + capped, environment coerced, labels trimmed/deduped/capped) so the
 * store stays the authority regardless of what the client sent. Stamps
 * `updated_at`. Returns the resolved value that was written.
 */
export async function upsertNodeMetadata(
  nodeId: string,
  input: NodeMetadataInput,
): Promise<NodeMetadataValue> {
  const note = normalizeNote(input.note);
  const environment = normalizeEnvironment(input.environment);
  const labels = normalizeLabels(input.labels ?? []);
  const updatedAt = new Date();

  await db
    .insert(nodeMetadata)
    .values({ nodeId, note, environment, labels, updatedAt })
    .onConflictDoUpdate({
      target: nodeMetadata.nodeId,
      set: { note, environment, labels, updatedAt },
    });

  return {
    note,
    environment,
    labels,
    updatedAt: updatedAt.getTime(),
  };
}

/** Remove a node's annotations entirely. A no-op when there is no row. */
export async function deleteNodeMetadata(nodeId: string): Promise<void> {
  await db.delete(nodeMetadata).where(eq(nodeMetadata.nodeId, nodeId));
}

/**
 * Bulk-remove annotations for several nodes (node bulk-delete cleanup). A no-op
 * for an empty list. Best-effort: a cleanup failure never blocks the delete the
 * control plane already accepted, so callers may swallow a rejection.
 */
export async function deleteNodeMetadataMany(
  nodeIds: readonly string[],
): Promise<void> {
  if (nodeIds.length === 0) return;
  await db
    .delete(nodeMetadata)
    .where(inArray(nodeMetadata.nodeId, [...nodeIds]));
}
