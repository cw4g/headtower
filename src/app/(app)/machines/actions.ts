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

  await audit(gate.session, {
    action: "node.delete",
    targetType: "node",
    targetId: id,
  });
  // The node is gone: refresh the list and drop the now-dead detail path.
  revalidateNode(id);
  return { status: "success" };
}
