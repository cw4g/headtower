/**
 * API keys resource - Headscale 0.26 - 0.29.
 *
 *   GET    /api/v1/apikey                         list()
 *   POST   /api/v1/apikey                         create(input?)
 *   POST   /api/v1/apikey/expire   { prefix }     expire(prefix)
 *   DELETE /api/v1/apikey/{prefix}                remove(prefix)
 *
 * These are the keys that authenticate this very client. The full secret is
 * only ever returned by `create`; afterwards only the non-secret `prefix` is
 * exposed.
 *
 * Server-only; see ./client.
 */

import { request } from "./client";
import type {
  ApiKey,
  CreateApiKeyResponse,
  ListApiKeysResponse,
} from "./types";

export type { ApiKey } from "./types";

function seg(value: string): string {
  return encodeURIComponent(value);
}

export const apiKeys = {
  /** List API keys (metadata only - never the secret values). */
  async list(): Promise<ApiKey[]> {
    const res = await request<ListApiKeysResponse>("/v1/apikey");
    return res.apiKeys ?? [];
  },

  /**
   * Create an API key. Returns the full secret string, shown exactly once.
   * Provide an RFC 3339 `expiration`; Headscale does not assign a default.
   */
  async create(input: { expiration?: string } = {}): Promise<string> {
    const res = await request<CreateApiKeyResponse>("/v1/apikey", {
      method: "POST",
      body: { expiration: input.expiration },
    });
    return res.apiKey;
  },

  /** Expire an API key by its prefix. */
  async expire(prefix: string): Promise<void> {
    await request<unknown>("/v1/apikey/expire", {
      method: "POST",
      body: { prefix },
    });
  },

  /** Delete an API key by its prefix. */
  async remove(prefix: string): Promise<void> {
    await request<unknown>(`/v1/apikey/${seg(prefix)}`, { method: "DELETE" });
  },
};
