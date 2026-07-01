/**
 * Additional OIDC identity providers - synchronous store (server-only).
 *
 * Backs the `oidc_provider` table (see `@/lib/db/schema`). Talks to the raw
 * synchronous `node:sqlite` handle rather than the async Drizzle proxy for the
 * same reason `@/lib/config` does: the auth layer (`@/lib/auth/oidc`) reads
 * providers synchronously during the login/callback flow, so reads here must
 * not be promises.
 *
 * A provider row is distinct from the legacy single OIDC config in
 * `app_settings` (`oidc.issuer` / `oidc.client_id` / `oidc.client_secret`,
 * still read by `@/lib/config` unchanged) - the login page renders one button
 * per enabled row here, plus the legacy provider when it is configured, so any
 * number of providers can be live at once.
 *
 * Two read shapes:
 *   {@link OidcProviderSummary}  non-secret fields, safe for the settings UI list.
 *   {@link OidcProviderSecrets}  includes the decoded client secret - INTERNAL,
 *                                 only for the auth flow's token exchange.
 *
 * SERVER-ONLY: importing this pulls `node:sqlite` into the bundle.
 */

import { sqlite } from "@/lib/db";
import { decodeSecret, encodeSecret, ConfigError } from "@/lib/config";

/** Non-secret provider fields, safe to send to the settings UI. */
export interface OidcProviderSummary {
  id: string;
  name: string;
  issuer: string;
  clientId: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: number;
}

/** Full provider config with the decoded client secret - internal use only. */
export interface OidcProviderSecrets {
  id: string;
  name: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
}

/** The login page's per-provider button target. */
export interface OidcProviderLoginEntry {
  id: string;
  name: string;
}

interface Row {
  id: string;
  name: string;
  issuer: string;
  client_id: string;
  client_secret: string;
  enabled: number;
  sort_order: number;
  created_at: number;
}

function toSummary(row: Row): OidcProviderSummary {
  return {
    id: row.id,
    name: row.name,
    issuer: row.issuer,
    clientId: row.client_id,
    enabled: row.enabled === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

/** List every provider (enabled or not), ordered for the settings UI. */
export function listProviders(): OidcProviderSummary[] {
  try {
    const rows = sqlite
      .prepare("SELECT * FROM oidc_provider ORDER BY sort_order ASC, created_at ASC")
      .all() as Row[];
    return rows.map(toSummary);
  } catch {
    return [];
  }
}

/** Enabled providers only, in login-page order. Never throws. */
export function listEnabledProvidersForLogin(): OidcProviderLoginEntry[] {
  try {
    const rows = sqlite
      .prepare(
        "SELECT id, name FROM oidc_provider WHERE enabled = 1 ORDER BY sort_order ASC, created_at ASC",
      )
      .all() as Array<{ id: string; name: string }>;
    return rows;
  } catch {
    return [];
  }
}

/** True when at least one provider row is enabled. Never throws. */
export function hasEnabledProvider(): boolean {
  try {
    const row = sqlite
      .prepare("SELECT 1 FROM oidc_provider WHERE enabled = 1 LIMIT 1")
      .get();
    return row !== undefined;
  } catch {
    return false;
  }
}

/**
 * Resolve one provider's full config (decoded secret) for the auth flow. Null
 * when the id doesn't exist, the provider is disabled, or the secret can no
 * longer be decoded (`HEADTOWER_SECRET` rotated away).
 */
export function getProviderSecrets(id: string): OidcProviderSecrets | null {
  const row = sqlite
    .prepare("SELECT * FROM oidc_provider WHERE id = ? AND enabled = 1")
    .get(id) as Row | undefined;
  if (!row) return null;
  const clientSecret = decodeSecret(row.client_secret);
  if (!clientSecret) return null;
  return {
    id: row.id,
    name: row.name,
    issuer: row.issuer,
    clientId: row.client_id,
    clientSecret,
  };
}

/** Fields accepted when creating or updating a provider. */
export interface ProviderInput {
  name: string;
  issuer: string;
  clientId: string;
  /** Plaintext; encoded before storage. */
  clientSecret: string;
}

function validate(input: ProviderInput): void {
  if (!input.name.trim()) throw new ConfigError("Enter a name for the provider.");
  if (!input.issuer.trim()) throw new ConfigError("Enter the issuer URL.");
  try {
    const url = new URL(input.issuer.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
  } catch {
    throw new ConfigError(`Issuer URL is not valid: ${JSON.stringify(input.issuer)}.`);
  }
  if (!input.clientId.trim()) throw new ConfigError("Enter the client ID.");
  if (!input.clientSecret.trim()) throw new ConfigError("Enter the client secret.");
}

/** Create a provider, appended to the end of the display order. Returns its id. */
export function createProvider(input: ProviderInput): string {
  validate(input);
  const id = crypto.randomUUID();
  const nextOrder = sqlite
    .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM oidc_provider")
    .get() as { n: number };
  sqlite
    .prepare(
      "INSERT INTO oidc_provider (id, name, issuer, client_id, client_secret, enabled, sort_order, created_at) " +
        "VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
    )
    .run(
      id,
      input.name.trim(),
      input.issuer.trim().replace(/\/+$/, ""),
      input.clientId.trim(),
      encodeSecret(input.clientSecret.trim()),
      nextOrder.n,
      Date.now(),
    );
  return id;
}

/**
 * Update a provider's fields. `clientSecret` empty/omitted keeps the stored
 * secret; a non-empty value rotates it.
 */
export function updateProvider(
  id: string,
  input: Omit<ProviderInput, "clientSecret"> & { clientSecret?: string },
): void {
  if (!input.name.trim()) throw new ConfigError("Enter a name for the provider.");
  try {
    const url = new URL(input.issuer.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
  } catch {
    throw new ConfigError(`Issuer URL is not valid: ${JSON.stringify(input.issuer)}.`);
  }
  if (!input.clientId.trim()) throw new ConfigError("Enter the client ID.");

  if (input.clientSecret?.trim()) {
    sqlite
      .prepare(
        "UPDATE oidc_provider SET name = ?, issuer = ?, client_id = ?, client_secret = ? WHERE id = ?",
      )
      .run(
        input.name.trim(),
        input.issuer.trim().replace(/\/+$/, ""),
        input.clientId.trim(),
        encodeSecret(input.clientSecret.trim()),
        id,
      );
  } else {
    sqlite
      .prepare("UPDATE oidc_provider SET name = ?, issuer = ?, client_id = ? WHERE id = ?")
      .run(input.name.trim(), input.issuer.trim().replace(/\/+$/, ""), input.clientId.trim(), id);
  }
}

/** Enable or disable a provider without touching its other fields. */
export function setProviderEnabled(id: string, enabled: boolean): void {
  sqlite
    .prepare("UPDATE oidc_provider SET enabled = ? WHERE id = ?")
    .run(enabled ? 1 : 0, id);
}

/** Delete a provider. A no-op when the id doesn't exist. */
export function removeProvider(id: string): void {
  sqlite.prepare("DELETE FROM oidc_provider WHERE id = ?").run(id);
}

/** Persist a new display order (index in the array = new `sort_order`). */
export function reorderProviders(ids: string[]): void {
  const stmt = sqlite.prepare("UPDATE oidc_provider SET sort_order = ? WHERE id = ?");
  ids.forEach((id, index) => stmt.run(index, id));
}
