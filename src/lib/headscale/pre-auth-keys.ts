/**
 * Pre-auth keys resource - Headscale 0.26 - 0.29.
 *
 *   GET    /api/v1/preauthkey?user={id}          list({ user })
 *   GET    /api/v1/preauthkey                     listAll()         (0.29+)
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

import { HeadscaleRequestError, request } from "./client";
import { users } from "./users";
import type {
  ListPreAuthKeysResponse,
  PreAuthKey,
  PreAuthKeyResponse,
  User,
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

  /**
   * List every pre-auth key across every user, de-duplicated by id.
   *
   * Tries the unfiltered `list()` call first - on 0.29+ that alone returns the
   * full set. 0.26 - 0.28 require the `user` filter and reject the unfiltered
   * call, so this falls back to fetching every user, then that user's keys, and
   * merging the batches - the same shape the settings and dashboard views used
   * to hand-roll. Pass an already-fetched `users` list to skip the extra
   * `users.list()` round trip when the fallback runs.
   */
  async listAll(options: { users?: User[] } = {}): Promise<PreAuthKey[]> {
    try {
      return await preAuthKeys.list();
    } catch (err) {
      if (!(err instanceof HeadscaleRequestError)) throw err;
    }

    const allUsers = options.users ?? (await users.list());
    const batches = await Promise.all(
      allUsers.map((user) => preAuthKeys.list({ user: user.id })),
    );
    const byId = new Map<string, PreAuthKey>();
    for (const batch of batches) {
      for (const key of batch) byId.set(key.id, key);
    }
    return [...byId.values()];
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
