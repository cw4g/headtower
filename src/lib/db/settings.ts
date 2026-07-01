/**
 * Headtower app-settings store - synchronous key/value access (server-only).
 *
 * Backs the DB-first configuration layer in `@/lib/config`. It talks to the raw
 * synchronous `node:sqlite` handle (`sqlite`) rather than the async Drizzle proxy
 * (`db`) for one deliberate reason: `getConfig()` is called synchronously all over
 * the server (the Headscale client, the auth layer, RBAC gates) and must stay
 * synchronous, so its backing reads cannot be promises.
 *
 * Every read is wrapped so a not-yet-openable database (e.g. during `next build`,
 * before any request) resolves to "no stored settings" instead of throwing - the
 * config layer then falls back cleanly to the env bootstrap.
 *
 * SERVER-ONLY: importing this (via `@/lib/db`) pulls `node:sqlite` into the
 * bundle; keep it out of client components.
 */

import { sqlite } from "./client";

/** Read a single setting's raw stored value, or null when absent/unavailable. */
export function readSetting(key: string): string | null {
  try {
    const row = sqlite
      .prepare("SELECT value FROM app_settings WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/** Read every setting as a plain `key -> value` map ({} when unavailable). */
export function readAllSettings(): Record<string, string> {
  try {
    const rows = sqlite
      .prepare("SELECT key, value FROM app_settings")
      .all() as Array<{ key: string; value: string }>;
    const out: Record<string, string> = {};
    for (const row of rows) out[row.key] = row.value;
    return out;
  } catch {
    return {};
  }
}

/** Insert or replace a setting's raw value, stamping `updated_at`. */
export function writeSetting(key: string, value: string): void {
  sqlite
    .prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .run(key, value, Date.now());
}

/** Remove a setting if present. A no-op when the key is absent. */
export function deleteSetting(key: string): void {
  sqlite.prepare("DELETE FROM app_settings WHERE key = ?").run(key);
}
