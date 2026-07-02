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
 * `approvedRoutes` is the node's approved set as the caller (the routes board)
 * last read it, threaded through so `routes.approve`/`revoke` can skip an
 * extra GET - see the last-writer-wins note on those functions.
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

  try {
    if (approve) {
      await routes.approve(nodeId, cidr, approvedRoutes);
    } else {
      await routes.revoke(nodeId, cidr, approvedRoutes);
    }
  } catch (err) {
    return { status: "error", error: describeHeadscaleError(err) };
  }

  await audit(gate.session, {
    action: approve ? "routes.approve" : "routes.revoke",
    targetType: "node",
    targetId: nodeId,
    detail: { cidr },
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
  /** CIDRs newly approved on this node - surfaced in the confirm dialog and audit detail. */
  cidrs: string[];
  /** Full approved set to write for this node (existing approvals + `cidrs`). */
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

  try {
    for (const entry of entries) {
      await routes.setApproved(entry.nodeId, entry.approvedRoutes);
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
    detail: {
      nodes: entries.map((entry) => ({
        nodeId: entry.nodeId,
        nodeName: entry.nodeName,
        cidrs: entry.cidrs,
      })),
    },
  });
  revalidatePath("/routes");
  return { status: "success" };
}
