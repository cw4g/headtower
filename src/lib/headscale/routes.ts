/**
 * Routes resource - Headscale 0.26 - 0.29.
 *
 * Headscale 0.26 removed the standalone `/api/v1/routes` endpoints. Subnet-route
 * state now lives on each node and approval is per-node, so this module is a
 * thin projection over the `nodes` resource rather than its own REST surface:
 *
 *   list()                  -> route state for every node (from GET /v1/node)
 *   forNode(id)             -> route state for one node (from GET /v1/node/{id})
 *   setApproved(id, routes) -> POST /v1/node/{id}/approve_routes
 *   approve(id, route)      -> approve one additional route on a node
 *   revoke(id, route)       -> remove one route from a node's approved set
 *
 * Server-only; see ./client.
 */

import { nodes } from "./nodes";
import type { HeadscaleId, Node } from "./types";

/** Route state for a single node, flattened for a routes table. */
export interface NodeRoutes {
  nodeId: HeadscaleId;
  /** Friendly node name (`givenName`, falling back to `name`). */
  nodeName: string;
  /** Routes the node is advertising. */
  available: string[];
  /** Routes an operator has approved. */
  approved: string[];
  /** Routes actually being served (advertised and approved). */
  subnet: string[];
}

function project(node: Node): NodeRoutes {
  return {
    nodeId: node.id,
    nodeName: node.givenName || node.name,
    available: node.availableRoutes ?? [],
    approved: node.approvedRoutes ?? [],
    subnet: node.subnetRoutes ?? [],
  };
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export const routes = {
  /** Route state for every node in the tailnet. */
  async list(): Promise<NodeRoutes[]> {
    const all = await nodes.list();
    return all.map(project);
  },

  /** Route state for a single node. */
  async forNode(id: HeadscaleId | number): Promise<NodeRoutes> {
    return project(await nodes.get(id));
  },

  /**
   * Set a node's approved routes to exactly `approvedRoutes`. This is the raw
   * `approve_routes` call - the array fully replaces the existing approved set.
   * Returns the updated route state.
   */
  async setApproved(
    id: HeadscaleId | number,
    approvedRoutes: string[],
  ): Promise<NodeRoutes> {
    return project(await nodes.approveRoutes(id, approvedRoutes));
  },

  /**
   * Approve one additional route, preserving the node's existing approvals.
   * Reads the node first to compute the new set.
   */
  async approve(id: HeadscaleId | number, route: string): Promise<NodeRoutes> {
    const node = await nodes.get(id);
    const next = uniqueSorted([...(node.approvedRoutes ?? []), route]);
    return project(await nodes.approveRoutes(id, next));
  },

  /**
   * Revoke one route from a node's approved set, preserving the rest. Reads the
   * node first to compute the new set.
   */
  async revoke(id: HeadscaleId | number, route: string): Promise<NodeRoutes> {
    const node = await nodes.get(id);
    const next = (node.approvedRoutes ?? []).filter((r) => r !== route);
    return project(await nodes.approveRoutes(id, next));
  },
};
