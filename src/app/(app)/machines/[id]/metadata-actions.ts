"use server";

/**
 * Server Actions for a node's Headtower-local metadata (note / environment /
 * labels). Unlike the mutations in `../actions.ts`, these never touch Headscale:
 * they read and write Headtower's own SQLite (`node_metadata`), keyed by the
 * Headscale node id. The control plane is untouched, so there is nothing to
 * revalidate there - only this app's detail (and list) paths.
 *
 * Both actions gate on `machines.write` (the same capability as renaming or
 * tagging a node) and record an audit entry, matching the neighbouring node
 * mutations so the trail stays uniform.
 */

import { revalidatePath } from "next/cache";
import { audit, authorize } from "@/lib/authz";
import {
  upsertNodeMetadata,
  deleteNodeMetadata,
  normalizeLabels,
  normalizeNote,
  normalizeEnvironment,
  NOTE_MAX_LENGTH,
  LABEL_MAX_COUNT,
  LABEL_MAX_LENGTH,
} from "@/lib/db";

/** Outcome shape shared with the metadata dialog's inline error handling. */
export interface MetadataActionResult {
  status: "success" | "error";
  /** Present only when `status === "error"`. */
  error?: string;
}

/** The metadata fields the dialog submits. */
export interface NodeMetadataFormInput {
  note: string;
  /** "" means "no environment"; any other value is coerced to a known one. */
  environment: string;
  labels: string[];
}

/** Refresh this node's detail page and the machines list after a write. */
function revalidateNode(id: string): void {
  revalidatePath("/machines");
  revalidatePath(`/machines/${id}`);
}

/**
 * Insert or replace a node's metadata. Validates against the same limits the
 * dialog enforces (so a hand-crafted request can't slip past the UI), then
 * writes and audits. The store normalises again defensively.
 */
export async function saveNodeMetadata(
  id: string,
  input: NodeMetadataFormInput,
): Promise<MetadataActionResult> {
  const gate = await authorize("machines.write");
  if (!gate.ok) {
    return { status: "error", error: gate.reason };
  }

  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length > NOTE_MAX_LENGTH) {
    return {
      status: "error",
      error: `Note must be ${NOTE_MAX_LENGTH} characters or fewer.`,
    };
  }

  const rawLabels = Array.isArray(input.labels) ? input.labels : [];
  if (rawLabels.some((l) => typeof l === "string" && l.trim().length > LABEL_MAX_LENGTH)) {
    return {
      status: "error",
      error: `Each label must be ${LABEL_MAX_LENGTH} characters or fewer.`,
    };
  }
  const labels = normalizeLabels(rawLabels);
  if (labels.length > LABEL_MAX_COUNT) {
    return {
      status: "error",
      error: `Keep ${LABEL_MAX_COUNT} labels or fewer.`,
    };
  }

  const environment = normalizeEnvironment(input.environment);

  try {
    await upsertNodeMetadata(id, {
      note: normalizeNote(note),
      environment,
      labels,
    });
  } catch {
    return { status: "error", error: "Couldn't save metadata." };
  }

  await audit(gate.session, {
    action: "node.metadata.set",
    targetType: "node",
    targetId: id,
    detail: {
      hasNote: note.length > 0,
      environment: environment ?? null,
      labelCount: labels.length,
    },
  });
  revalidateNode(id);
  return { status: "success" };
}

/** Clear a node's metadata entirely (removes the local row). */
export async function clearNodeMetadata(
  id: string,
): Promise<MetadataActionResult> {
  const gate = await authorize("machines.write");
  if (!gate.ok) {
    return { status: "error", error: gate.reason };
  }

  try {
    await deleteNodeMetadata(id);
  } catch {
    return { status: "error", error: "Couldn't clear metadata." };
  }

  await audit(gate.session, {
    action: "node.metadata.clear",
    targetType: "node",
    targetId: id,
  });
  revalidateNode(id);
  return { status: "success" };
}
