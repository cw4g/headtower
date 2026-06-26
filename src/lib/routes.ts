/**
 * Route presentation helpers.
 *
 * Pure, isomorphic logic shared by the Routes server page and its client board:
 * classify every CIDR a node advertises or has been approved for into a
 * render-ready state, and split the two default routes (the exit-node
 * capability) out from ordinary subnet routes.
 *
 * No server-only imports here - safe to pull into a `"use client"` component.
 */

import type { NodeRoutes } from "@/lib/headscale";
import { DEFAULT_ROUTES } from "@/lib/machines";

/** Approval state of a single route, from the operator's point of view. */
export type RouteState = "active" | "approved" | "pending";

/** A non-default subnet route a node carries, classified for the table. */
export interface SubnetRoute {
  cidr: string;
  state: RouteState;
}

/** A node's exit-node (default-route) capability, collapsed to one control. */
export interface ExitStatus {
  /** null when the node neither advertises nor is approved for a default route. */
  state: RouteState | null;
  /** Default routes involved (advertised or approved), sorted, for display. */
  cidrs: string[];
}

/** Everything the UI needs to render one node's routes. */
export interface RouteGroup {
  nodeId: string;
  nodeName: string;
  /** Non-default subnet routes, sorted by CIDR. */
  subnet: SubnetRoute[];
  exit: ExitStatus;
  /** Routes (subnet rows + exit) awaiting an approval decision. */
  pendingCount: number;
  /** Routes (subnet rows + exit) already approved. */
  approvedCount: number;
}

/** True for either of the two routes that together make a node an exit node. */
export function isDefaultRoute(cidr: string): boolean {
  return (DEFAULT_ROUTES as readonly string[]).includes(cidr);
}

/**
 * Classify one CIDR: `active` when it is both approved and still advertised
 * (so it is actually being served), `approved` when approved but no longer
 * advertised (a stale approval), `pending` when advertised but not yet approved.
 */
function classify(
  cidr: string,
  approved: Set<string>,
  available: Set<string>,
): RouteState {
  const isApproved = approved.has(cidr);
  const isAdvertised = available.has(cidr);
  if (isApproved && isAdvertised) return "active";
  if (isApproved) return "approved";
  return "pending";
}

/** Collapse a node's default routes into a single exit-node state. */
function classifyExit(node: NodeRoutes): RouteState {
  const advertised = node.available.some(isDefaultRoute);
  const approved = node.approved.some(isDefaultRoute);
  if (approved && advertised) return "active";
  if (approved) return "approved";
  return "pending";
}

/** Project one node's raw route state into a render-ready group. */
export function toRouteGroup(node: NodeRoutes): RouteGroup {
  const approved = new Set(node.approved);
  const available = new Set(node.available);
  // The union of advertised + approved is every route the node "carries", so a
  // stale approval the node has stopped advertising still surfaces for revoke.
  const union = [...new Set([...node.approved, ...node.available])];

  const subnet: SubnetRoute[] = union
    .filter((cidr) => !isDefaultRoute(cidr))
    .sort()
    .map((cidr) => ({ cidr, state: classify(cidr, approved, available) }));

  const exitCidrs = union.filter(isDefaultRoute).sort();
  const exit: ExitStatus =
    exitCidrs.length === 0
      ? { state: null, cidrs: [] }
      : { state: classifyExit(node), cidrs: exitCidrs };

  const states: (RouteState | null)[] = [
    ...subnet.map((r) => r.state),
    exit.state,
  ];
  const pendingCount = states.filter((s) => s === "pending").length;
  const approvedCount = states.filter(
    (s) => s === "active" || s === "approved",
  ).length;

  return {
    nodeId: node.nodeId,
    nodeName: node.nodeName,
    subnet,
    exit,
    pendingCount,
    approvedCount,
  };
}

/** True when a node has any route worth showing on the board. */
export function groupHasRoutes(group: RouteGroup): boolean {
  return group.subnet.length > 0 || group.exit.state !== null;
}
