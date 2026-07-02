/**
 * Pure helpers for turning a rendered `RouteGroup` into the shape
 * `approveAllPending` needs - no Headscale calls here, so this is safe to
 * import from both the server page (the header's "approve all pending") and
 * the client board (the per-row/per-node actions).
 */

import type { RouteGroup, RouteState } from "@/lib/routes";
import type { ApproveAllEntry } from "./actions";

function isApprovedState(state: RouteState | null): boolean {
  return state === "active" || state === "approved";
}

/** Every CIDR already approved on this node, per its rendered `RouteGroup`. */
export function approvedCidrsOf(group: RouteGroup): string[] {
  return [
    ...group.subnet.filter((r) => isApprovedState(r.state)).map((r) => r.cidr),
    ...(isApprovedState(group.exit.state) ? group.exit.cidrs : []),
  ];
}

/** Every CIDR on this node still awaiting an approval decision. */
function pendingCidrsOf(group: RouteGroup): string[] {
  return [
    ...group.subnet.filter((r) => r.state === "pending").map((r) => r.cidr),
    ...(group.exit.state === "pending" ? group.exit.cidrs : []),
  ];
}

/**
 * The batch entry to approve every pending route on one node, or `null` when
 * the node has nothing pending (the caller should skip it).
 */
export function buildApproveAllEntry(group: RouteGroup): ApproveAllEntry | null {
  const pending = pendingCidrsOf(group);
  if (pending.length === 0) return null;
  return {
    nodeId: group.nodeId,
    nodeName: group.nodeName,
    cidrs: pending,
    approvedRoutes: [...new Set([...approvedCidrsOf(group), ...pending])],
  };
}

/** Batch entries for every node in `groups` that has at least one pending route. */
export function buildApproveAllEntries(groups: RouteGroup[]): ApproveAllEntry[] {
  return groups
    .map(buildApproveAllEntry)
    .filter((entry): entry is ApproveAllEntry => entry !== null);
}
