"use server";

/**
 * Server Actions for the Routes view.
 *
 * Route approval lives on the node in Headscale 0.26+, so these mutations run on
 * the server, hit the admin API through our routes client, then revalidate the
 * route so the board reflects the new approved set on the next render.
 *
 * `setRouteApproval`/`setExitApproval` act on one CIDR at a time; `approveAllPending`
 * batches a whole node (or several) into one audit entry, looping `routes.setApproved`
 * per node instead of the client firing one round trip per pending CIDR.
 */

import { revalidatePath } from "next/cache";
import { routes } from "@/lib/headscale";
import { isDefaultRoute } from "@/lib/routes";
import { audit, authorize } from "@/lib/authz";
import { describeHeadscaleError } from "./errors";

/** Result of a route mutation, surfaced inline on the row that triggered it. */
export interface RouteActionState {
  status: "success" | "error";
  /** Present only when `status === "error"`. */
  error?: string;
}

/**
 * Approve or revoke a single advertised subnet route on a node. `approve`
 * decides the direction: true adds the CIDR to the node's approved set, false
 * removes it. Both preserve the node's other approvals.
 *
 * A single server-side `nodes.get` validates that the CIDR is one the node is
 * actually advertising (rejecting a crafted request otherwise) and bounds the
 * written set to routes the node carries. `approvedRoutes` - the caller's
 * last-read approved snapshot - is still the write base, keeping the
 * last-writer-wins race-shrink; the audit records the exact set written.
 */
export async function setRouteApproval(
  nodeId: string,
  cidr: string,
  approve: boolean,
  approvedRoutes: string[],
): Promise<RouteActionState> {
  if (!nodeId || !cidr) {
    return { status: "error", error: "Missing node or route." };
  }

  const gate = await authorize("routes.write");
  if (!gate.ok) {
    return { status: "error", error: gate.reason };
  }

  let approved: string[] = [];
  try {
    // A single server-side read (nodes.get, via forNode) gives the node's
    // authoritative advertised + approved sets. We validate against these
    // rather than trusting the client's snapshot, while still using that
    // snapshot as the write base so the last-writer-wins race-shrink stands.
    const state = await routes.forNode(nodeId);
    if (approve && !state.available.includes(cidr)) {
      return {
        status: "error",
        error: "This node is not advertising that route.",
      };
    }
    // Keep only routes the node actually carries (advertised or already
    // approved), so a tampered snapshot can't smuggle in an unadvertised CIDR.
    const carried = new Set([...state.approved, ...state.available]);
    const base = approvedRoutes.filter((route) => carried.has(route));
    const next = approve
      ? [...new Set([...base, cidr])].sort()
      : base.filter((route) => route !== cidr);
    approved = (await routes.setApproved(nodeId, next)).approved;
  } catch (err) {
    return { status: "error", error: describeHeadscaleError(err) };
  }

  await audit(gate.session, {
    action: approve ? "routes.approve" : "routes.revoke",
    targetType: "node",
    targetId: nodeId,
    // The exact approved set written to Headscale, not the client's labels.
    detail: { cidr, approved },
  });
  revalidatePath("/routes");
  return { status: "success" };
}

/**
 * Approve or revoke a node's exit-node capability. A node can advertise one or
 * both default routes (0.0.0.0/0, ::/0), so this reads the node's live state and
 * rewrites the approved set wholesale: on approve it adds every default route
 * the node is advertising; on revoke it drops every default route it holds.
 */
export async function setExitApproval(
  nodeId: string,
  approve: boolean,
): Promise<RouteActionState> {
  if (!nodeId) {
    return { status: "error", error: "Missing node." };
  }

  const gate = await authorize("routes.write");
  if (!gate.ok) {
    return { status: "error", error: gate.reason };
  }

  try {
    const state = await routes.forNode(nodeId);
    const next = approve
      ? [
          ...new Set([
            ...state.approved,
            ...state.available.filter(isDefaultRoute),
          ]),
        ]
      : state.approved.filter((route) => !isDefaultRoute(route));
    await routes.setApproved(nodeId, next);
  } catch (err) {
    return { status: "error", error: describeHeadscaleError(err) };
  }

  await audit(gate.session, {
    action: approve ? "routes.approve" : "routes.revoke",
    targetType: "node",
    targetId: nodeId,
    detail: { exit: true },
  });
  revalidatePath("/routes");
  return { status: "success" };
}

/** One node's contribution to a batched {@link approveAllPending} mutation. */
export interface ApproveAllEntry {
  nodeId: string;
  nodeName: string;
  /** Pending CIDRs to approve - shown in the confirm dialog and validated server-side against what the node advertises. */
  cidrs: string[];
  /** The caller's last-read approved snapshot, used as the write base (bounded server-side to routes the node carries). */
  approvedRoutes: string[];
}

/**
 * Approve every pending route on one or more nodes as a single operator
 * decision: one `approve_routes` call per node (looping here, server-side)
 * rather than the client firing one round trip per CIDR, and one audit entry
 * covering every route approved instead of one per CIDR or per node.
 */
export async function approveAllPending(
  entries: ApproveAllEntry[],
): Promise<RouteActionState> {
  if (entries.length === 0) {
    return { status: "error", error: "Nothing to approve." };
  }

  const gate = await authorize("routes.write");
  if (!gate.ok) {
    return { status: "error", error: gate.reason };
  }

  const written: { nodeId: string; nodeName: string; approved: string[] }[] =
    [];
  try {
    for (const entry of entries) {
      // One server-side read per node validates the pending CIDRs against what
      // the node is actually advertising and bounds the written set, matching
      // `setRouteApproval`.
      const state = await routes.forNode(entry.nodeId);
      const carried = new Set([...state.approved, ...state.available]);
      const base = entry.approvedRoutes.filter((route) => carried.has(route));
      const toApprove = entry.cidrs.filter((cidr) =>
        state.available.includes(cidr),
      );
      const next = [...new Set([...base, ...toApprove])].sort();
      const result = await routes.setApproved(entry.nodeId, next);
      written.push({
        nodeId: entry.nodeId,
        nodeName: entry.nodeName,
        approved: result.approved,
      });
    }
  } catch (err) {
    return { status: "error", error: describeHeadscaleError(err) };
  }

  // A single node's approval keeps the usual node target; a multi-node sweep
  // has no one target, so the full breakdown lives in `detail` instead.
  const single = entries.length === 1 ? entries[0] : null;
  await audit(gate.session, {
    action: "routes.approve",
    targetType: "node",
    targetId: single?.nodeId,
    targetName: single?.nodeName,
    // The exact approved set written per node, not the client's labels.
    detail: { nodes: written },
  });
  revalidatePath("/routes");
  return { status: "success" };
}
