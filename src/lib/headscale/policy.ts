/**
 * Policy resource - Headscale 0.26 - 0.29.
 *
 *   GET    /api/v1/policy                         get()
 *   PUT    /api/v1/policy          { policy }      set(document)
 *
 * The policy is the tailnet's ACL document (HuJSON). `get` only succeeds when
 * Headscale runs in `policy.mode: database`; in `file` mode the server manages
 * the document itself and returns an error (which surfaces as a typed
 * HeadscaleRequestError - fail loud).
 *
 * Server-only; see ./client.
 */

import { request } from "./client";
import type { Policy } from "./types";

export type { Policy } from "./types";

export const policy = {
  /** Fetch the current policy document and its last-updated timestamp. */
  async get(): Promise<Policy> {
    return request<Policy>("/v1/policy");
  },

  /**
   * Replace the policy document. `document` is the raw HuJSON string. Returns
   * the stored policy and its new `updatedAt`. Headscale validates the document
   * and rejects an invalid one with a typed HeadscaleRequestError.
   */
  async set(document: string): Promise<Policy> {
    return request<Policy>("/v1/policy", {
      method: "PUT",
      body: { policy: document },
    });
  },
};
