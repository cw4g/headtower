/**
 * Users resource - Headscale 0.26 - 0.29.
 *
 *   GET    /api/v1/user                          list(filter?)
 *   POST   /api/v1/user                          create(input)
 *   POST   /api/v1/user/{id}/rename/{name}       rename(id, name)
 *   DELETE /api/v1/user/{id}                      remove(id)
 *
 * Server-only; see ./client.
 */

import { request } from "./client";
import type { ListUsersResponse, User, UserResponse } from "./types";

export type { User } from "./types";

/** Accepts the string id from the API or a number for convenience. */
type UserId = string | number;

function seg(value: UserId | string): string {
  return encodeURIComponent(String(value));
}

/** Server-side filters for {@link users.list}. All are optional. */
export interface ListUsersFilter {
  id?: UserId;
  name?: string;
  email?: string;
}

/** Fields accepted when creating a user. Only `name` is required. */
export interface CreateUserInput {
  name: string;
  displayName?: string;
  email?: string;
  /** Profile picture URL (maps to the API's `pictureUrl` field). */
  pictureUrl?: string;
}

export const users = {
  /** List users, optionally narrowed by id, name, and/or email. */
  async list(filter: ListUsersFilter = {}): Promise<User[]> {
    const res = await request<ListUsersResponse>("/v1/user", {
      query: { id: filter.id, name: filter.name, email: filter.email },
    });
    return res.users ?? [];
  },

  /** Create a user. Returns the created user. */
  async create(input: CreateUserInput): Promise<User> {
    const res = await request<UserResponse>("/v1/user", {
      method: "POST",
      body: {
        name: input.name,
        displayName: input.displayName,
        email: input.email,
        pictureUrl: input.pictureUrl,
      },
    });
    return res.user;
  },

  /** Rename a user by id. Returns the updated user. */
  async rename(id: UserId, newName: string): Promise<User> {
    const res = await request<UserResponse>(
      `/v1/user/${seg(id)}/rename/${seg(newName)}`,
      { method: "POST" },
    );
    return res.user;
  },

  /** Delete a user by id. */
  async remove(id: UserId): Promise<void> {
    await request<unknown>(`/v1/user/${seg(id)}`, { method: "DELETE" });
  },
};
