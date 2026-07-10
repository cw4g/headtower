/**
 * Nodes (machines) resource - Headscale 0.26 - 0.29.
 *
 *   GET    /api/v1/node                          list()
 *   GET    /api/v1/node/{id}                     get(id)
 *   POST   /api/v1/node/register?user=&key=      register(user, key)
 *   POST   /api/v1/node/{id}/rename/{name}       rename(id, name)
 *   POST   /api/v1/node/{id}/tags        { tags }    setTags(id, tags)
 *   POST   /api/v1/node/{id}/approve_routes { routes } approveRoutes(id, routes)
 *   POST   /api/v1/node/{id}/user         { user }    moveUser(id, userId)
 *   POST   /api/v1/node/{id}/expire              expire(id)
 *   DELETE /api/v1/node/{id}                     remove(id)
 *
 * Server-only; see ./client.
 */

import { request } from "./client";
import type {
  ListNodesResponse,
  Node,
  NodeResponse,
} from "./types";

export type { Node } from "./types";

/** Accepts the string id from the API or a number for convenience. */
type NodeId = string | number;

function seg(value: NodeId | string): string {
  return encodeURIComponent(String(value));
}

export const nodes = {
  /**
   * List all nodes. Optionally filter by owning user (`user` is the username on
   * 0.26 - 0.28; the filter is a no-op on 0.29 which returns every node).
   */
  async list(options: { user?: string } = {}): Promise<Node[]> {
    const res = await request<ListNodesResponse>("/v1/node", {
      query: { user: options.user },
    });
    return res.nodes ?? [];
  },

  /** Fetch a single node by id. */
  async get(id: NodeId): Promise<Node> {
    const res = await request<NodeResponse>(`/v1/node/${seg(id)}`);
    return res.node;
  },

  /**
   * Register a node that began interactive login (`tailscale up --login-server`
   * with no auth key) and printed a registration key. `user` is the owning
   * user's numeric id (as with pre-auth keys); `key` is the registration key the
   * device showed (a `nodekey:...` / `mkey:...` value). Returns the new node.
   */
  async register(user: NodeId, key: string): Promise<Node> {
    const res = await request<NodeResponse>("/v1/node/register", {
      method: "POST",
      query: { user, key },
    });
    return res.node;
  },

  /** Set a node's given (display) name. Returns the updated node. */
  async rename(id: NodeId, newName: string): Promise<Node> {
    const res = await request<NodeResponse>(
      `/v1/node/${seg(id)}/rename/${seg(newName)}`,
      { method: "POST" },
    );
    return res.node;
  },

  /**
   * Replace the node's forced/ACL tags. `tags` should be the complete set; an
   * empty array clears them. Each tag must be `tag:`-prefixed.
   */
  async setTags(id: NodeId, tags: string[]): Promise<Node> {
    const res = await request<NodeResponse>(`/v1/node/${seg(id)}/tags`, {
      method: "POST",
      body: { tags },
    });
    return res.node;
  },

  /**
   * Set the routes an operator approves this node to serve. `routes` is the
   * complete approved set (CIDRs); pass the node's existing approved routes
   * plus/minus the change. Returns the updated node.
   */
  async approveRoutes(id: NodeId, routes: string[]): Promise<Node> {
    const res = await request<NodeResponse>(
      `/v1/node/${seg(id)}/approve_routes`,
      { method: "POST", body: { routes } },
    );
    return res.node;
  },

  /**
   * Reassign a node to a different owning user. `userId` is the target user's
   * numeric id (a decimal string, as returned by `users.list()` and used for
   * pre-auth keys and registration). Returns the updated node.
   *
   * The move endpoint has been present across the supported range (0.26 - 0.29),
   * so this needs no version gate: a Headscale old enough to lack it answers 404,
   * which surfaces as an ordinary request error - the same graceful degradation
   * as `preAuthKeys.remove` on pre-0.29 servers.
   */
  async moveUser(id: NodeId, userId: NodeId): Promise<Node> {
    const res = await request<NodeResponse>(`/v1/node/${seg(id)}/user`, {
      method: "POST",
      body: { user: userId },
    });
    return res.node;
  },

  /** Expire a node's key immediately, forcing it to re-authenticate. */
  async expire(id: NodeId): Promise<Node> {
    const res = await request<NodeResponse>(`/v1/node/${seg(id)}/expire`, {
      method: "POST",
    });
    return res.node;
  },

  /** Permanently delete a node from the tailnet. */
  async remove(id: NodeId): Promise<void> {
    await request<unknown>(`/v1/node/${seg(id)}`, { method: "DELETE" });
  },
};
