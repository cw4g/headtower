/**
 * Routes resource - Headscale 0.26 - 0.29.
 *
 * Headscale 0.26 removed the standalone `/api/v1/routes` endpoints. Subnet-route
 * state now lives on each node and approval is per-node, so this module is a
 * thin projection over the `nodes` resource rather than its own REST surface:
 *
 *   list()                            -> route state for every node (from GET /v1/node)
 *   forNode(id)                       -> route state for one node (from GET /v1/node/{id})
 *   setApproved(id, routes)           -> POST /v1/node/{id}/approve_routes
 *   approve(id, route, approved)      -> approve one additional route on a node
 *   revoke(id, route, approved)       -> remove one route from a node's approved set
 *
 * `approve`/`revoke` take the caller's already-loaded approved set instead of
 * fetching the node themselves - see the doc comment on `approve` for why.
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
   * Takes `approvedRoutes` from the caller (the page/board already read the
   * node's route state to render) instead of re-fetching it here.
   *
   * LAST-WRITER-WINS: `approve_routes` replaces the node's approved set
   * wholesale, and there is no compare-and-swap on it, so skipping our own GET
   * only shrinks the read-modify-write window - it doesn't close it. Two
   * operators approving different routes on the same node at nearly the same
   * moment can still race: whichever `approve_routes` call lands second wins
   * and silently drops the first operator's route from the written set.
   */
  async approve(
    id: HeadscaleId | number,
    route: string,
    approvedRoutes: string[],
  ): Promise<NodeRoutes> {
    const next = uniqueSorted([...approvedRoutes, route]);
    return project(await nodes.approveRoutes(id, next));
  },

  /**
   * Revoke one route from a node's approved set, preserving the rest. Same
   * caller-supplied-set contract (and the same last-writer-wins race) as
   * {@link approve}.
   */
  async revoke(
    id: HeadscaleId | number,
    route: string,
    approvedRoutes: string[],
  ): Promise<NodeRoutes> {
    const next = approvedRoutes.filter((r) => r !== route);
    return project(await nodes.approveRoutes(id, next));
  },
};
