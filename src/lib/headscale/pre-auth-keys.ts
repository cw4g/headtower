/**
 * Pre-auth keys resource - Headscale 0.26 - 0.29.
 *
 *   GET    /api/v1/preauthkey?user={id}          list({ user })
 *   POST   /api/v1/preauthkey                     create(input)
 *   POST   /api/v1/preauthkey/expire              expire(input)
 *   DELETE /api/v1/preauthkey?id={id}             remove({ id })   (0.29+)
 *
 * Version notes:
 *   - 0.26 - 0.28: list is filtered by `user` (numeric user id). Expiring a key
 *     is done by `{ user, key }`. There is no delete endpoint.
 *   - 0.29: the list filter was dropped (returns every key); expire and delete
 *     both key off the numeric pre-auth-key `id`.
 * `expire`/`remove` accept either shape so callers work across the range.
 *
 * Server-only; see ./client.
 */

import { request } from "./client";
import type {
  ListPreAuthKeysResponse,
  PreAuthKey,
  PreAuthKeyResponse,
} from "./types";

export type { PreAuthKey } from "./types";

/** Accepts the string id from the API or a number for convenience. */
type Id = string | number;

/** Fields accepted when creating a pre-auth key. */
export interface CreatePreAuthKeyInput {
  /** Owning user id (numeric, passed as the proto `user` uint64). */
  user: Id;
  /** Whether the key can enrol more than one node. */
  reusable?: boolean;
  /** Whether nodes enrolled with this key are ephemeral. */
  ephemeral?: boolean;
  /** RFC 3339 expiry; omit for a key that never expires. */
  expiration?: string;
  /** ACL tags to apply to nodes enrolled with this key (each `tag:`-prefixed). */
  aclTags?: string[];
}

/**
 * Identifies a key to expire. Provide `{ user, key }` (Headscale 0.26 - 0.28)
 * or `{ id }` (Headscale 0.29+).
 */
export type ExpirePreAuthKeyInput =
  | { user: Id; key: string; id?: never }
  | { id: Id; user?: never; key?: never };

export const preAuthKeys = {
  /**
   * List pre-auth keys. On 0.26 - 0.28 pass `{ user }` (a numeric user id) to
   * filter; on 0.29 the parameter is ignored and all keys are returned.
   */
  async list(options: { user?: Id } = {}): Promise<PreAuthKey[]> {
    const res = await request<ListPreAuthKeysResponse>("/v1/preauthkey", {
      query: { user: options.user },
    });
    return res.preAuthKeys ?? [];
  },

  /** Create a pre-auth key. Returns the key (its `key` field is the secret). */
  async create(input: CreatePreAuthKeyInput): Promise<PreAuthKey> {
    const res = await request<PreAuthKeyResponse>("/v1/preauthkey", {
      method: "POST",
      body: {
        user: input.user,
        reusable: input.reusable,
        ephemeral: input.ephemeral,
        expiration: input.expiration,
        aclTags: input.aclTags,
      },
    });
    return res.preAuthKey;
  },

  /** Expire a pre-auth key. See {@link ExpirePreAuthKeyInput} for the shape. */
  async expire(input: ExpirePreAuthKeyInput): Promise<void> {
    await request<unknown>("/v1/preauthkey/expire", {
      method: "POST",
      body: input,
    });
  },

  /**
   * Delete a pre-auth key by id. Headscale 0.29+ only - earlier releases have
   * no delete endpoint and will return 404; expire the key instead.
   */
  async remove(options: { id: Id }): Promise<void> {
    await request<unknown>("/v1/preauthkey", {
      method: "DELETE",
      query: { id: options.id },
    });
  },
};
