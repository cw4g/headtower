"use server";

/**
 * Server Actions for the Routes view.
 *
 * Route approval lives on the node in Headscale 0.26+, so these mutations run on
 * the server, hit the admin API through our routes client, then revalidate the
 * route so the board reflects the new approved set on the next render.
 */

import { revalidatePath } from "next/cache";
import { routes } from "@/lib/headscale";
import { isDefaultRoute } from "@/lib/routes";
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
 */
export async function setRouteApproval(
  nodeId: string,
  cidr: string,
  approve: boolean,
): Promise<RouteActionState> {
  if (!nodeId || !cidr) {
    return { status: "error", error: "Missing node or route." };
  }

  try {
    if (approve) {
      await routes.approve(nodeId, cidr);
    } else {
      await routes.revoke(nodeId, cidr);
    }
  } catch (err) {
    return { status: "error", error: describeHeadscaleError(err) };
  }

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

  revalidatePath("/routes");
  return { status: "success" };
}
