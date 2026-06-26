/**
 * Identify the API key this Headtower process authenticates with.
 *
 * Server-only. Headscale keys are formatted `<prefix>.<secret>`; the admin API
 * only ever exposes the non-secret `prefix`. We compare a listed prefix against
 * the configured key by prefix match, so the operator can't expire or delete
 * the credential the console is actively using.
 */

import { getConfig } from "@/lib/config";

export function isCurrentApiKey(prefix: string): boolean {
  if (!prefix) return false;
  try {
    const key = getConfig().headscale.apiKey;
    return key.length > 0 && key.startsWith(prefix);
  } catch {
    // Not configured: there is no current key to protect.
    return false;
  }
}
