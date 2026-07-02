/**
 * Headtower configuration - the EFFECTIVE, DB-first config (server-only).
 *
 * Headtower is zero-config: you can run it with no environment at all and set the
 * whole connection from the UI (the /setup wizard). To make that work, the
 * configuration is layered:
 *
 *     effective = DB app_settings  (overrides)   >   env bootstrap  (fallback)
 *
 * `getConfig()` reads both on every call and returns the merged result. Env still
 * works exactly as before for classic deployments, but nothing is *required*: an
 * unset Headscale connection is a first-class state (`headscale: null`) that the
 * app-shell turns into a redirect to /setup, rather than a thrown error.
 *
 * Env bootstrap (all optional now):
 *   HEADSCALE_URL, HEADSCALE_API_KEY
 *   HEADTOWER_OIDC_ISSUER, HEADTOWER_OIDC_CLIENT_ID, HEADTOWER_OIDC_CLIENT_SECRET
 *   HEADTOWER_AGENT_URL, HEADTOWER_AGENT_SSH_SECRET
 *   HEADTOWER_SECRET   - when set, secrets written to the DB are encrypted at rest
 *                        (AES-256-GCM, key = sha256(secret)); when absent they are
 *                        stored in plaintext (documented, see {@link encodeSecret}).
 *
 * The Headscale login-server URL (`headscale.login_server_url`, the public URL
 * tailnet clients use for `tailscale up --login-server`) and the agent's enabled
 * flag (`agent.enabled`) are DB-only settings with no env bootstrap.
 *
 * Writes go through {@link setConfig} (validated) or {@link setRawSetting} (raw);
 * {@link testHeadscaleConnection} performs a live probe used by the wizard.
 *
 * Kept SYNCHRONOUS: the DB reads use the synchronous `node:sqlite` handle, so the
 * many synchronous callers of `getConfig()` (Headscale client, auth, RBAC) are
 * unaffected. SERVER-ONLY - it reads secrets and touches `node:sqlite`; never
 * import it into a client component.
 */

import { cache } from "react";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import {
  deleteSetting,
  readAllSettings,
  readSetting,
  writeSetting,
} from "@/lib/db/settings";
import { ConfigError } from "./types";
import type {
  AgentConfig,
  ConfigSource,
  HeadscaleConfig,
  HeadtowerConfig,
  OidcConfig,
} from "./types";

// The pure types + error live in ./types so client components can import them
// (e.g. `ConfigError` for an error boundary) without pulling this DB-backed
// module - and `node:sqlite` - into the browser bundle.
export { ConfigError } from "./types";
export type {
  AgentConfig,
  ConfigSource,
  HeadscaleConfig,
  HeadtowerConfig,
  OidcConfig,
} from "./types";

/** Namespaced keys used in the `app_settings` store. */
export const SETTING_KEYS = {
  headscaleUrl: "headscale.url",
  headscaleApiKey: "headscale.api_key",
  headscaleLoginServerUrl: "headscale.login_server_url",
  oidcIssuer: "oidc.issuer",
  oidcClientId: "oidc.client_id",
  oidcClientSecret: "oidc.client_secret",
  agentUrl: "agent.url",
  agentSshSecret: "agent.ssh_secret",
  agentEnabled: "agent.enabled",
} as const;

function assertServer(): void {
  // A server-only violation is a programming mistake: surface it loudly.
  if (typeof window !== "undefined") {
    throw new Error(
      "@/lib/config is server-only and was used in a browser context. " +
        "Read configuration from a Server Component, Route Handler, or Server Action.",
    );
  }
}

/** Returns a trimmed env value, or undefined when unset or blank. */
function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Validate an http(s) URL and drop any trailing slash. Throws {@link ConfigError}. */
function normalizeUrl(label: string, raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ConfigError(`${label} is not a valid URL: ${JSON.stringify(raw)}.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ConfigError(
      `${label} must be an http(s) URL, got "${parsed.protocol}".`,
    );
  }
  return parsed.toString().replace(/\/+$/, "");
}

/** Like {@link normalizeUrl} but returns null instead of throwing (for reads). */
function tryNormalizeUrl(raw: string): string | null {
  try {
    return normalizeUrl("url", raw);
  } catch {
    return null;
  }
}

/** Host (and port) of a URL, for legible messages. Falls back to the raw string. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/* --------------------------------------------------------------------------
 * Secret encoding
 *
 * Secrets written to the DB (the Headscale API key, the OIDC client secret) are
 * wrapped with a scheme prefix so decoding is unambiguous:
 *   a1:<base64(iv|tag|ciphertext)>  AES-256-GCM, key = sha256(HEADTOWER_SECRET)
 *   p1:<plaintext>                  no HEADTOWER_SECRET set - stored in the clear
 * A value with no known prefix is treated as legacy plaintext. When HEADTOWER_SECRET
 * is unset (or was rotated away), an `a1:` value can no longer be decoded and reads
 * back as null, which the app treats as "unconfigured" and re-prompts via /setup.
 * -------------------------------------------------------------------------- */

const AES_PREFIX = "a1:";
const PLAIN_PREFIX = "p1:";

/** Derive the 32-byte AES key from HEADTOWER_SECRET, or null when unset. */
function secretKey(): Buffer | null {
  const secret = readEnv("HEADTOWER_SECRET");
  return secret ? createHash("sha256").update(secret).digest() : null;
}

/** Encode a secret for storage: AES-GCM when a secret is set, else plaintext. */
export function encodeSecret(plaintext: string): string {
  const key = secretKey();
  if (!key) return PLAIN_PREFIX + plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return AES_PREFIX + Buffer.concat([iv, tag, enc]).toString("base64");
}

/** Decode a stored secret, or null when it can no longer be read (secret rotated). */
export function decodeSecret(stored: string): string | null {
  if (stored.startsWith(PLAIN_PREFIX)) return stored.slice(PLAIN_PREFIX.length);
  if (stored.startsWith(AES_PREFIX)) {
    const key = secretKey();
    if (!key) return null;
    try {
      const raw = Buffer.from(stored.slice(AES_PREFIX.length), "base64");
      const iv = raw.subarray(0, 12);
      const tag = raw.subarray(12, 28);
      const enc = raw.subarray(28);
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
    } catch {
      return null;
    }
  }
  // Unknown/legacy prefix: assume it was stored verbatim.
  return stored;
}

/* --------------------------------------------------------------------------
 * Effective config
 * -------------------------------------------------------------------------- */

/**
 * Read, merge, and return the effective Headtower configuration.
 *
 * DB `app_settings` override the env bootstrap per field. Malformed values are
 * treated as "absent" rather than fatal, so a bad setting routes to /setup
 * instead of crashing.
 *
 * Memoized per request with React `cache()`: a dashboard render calls this
 * 15-20x (Headscale client, auth, RBAC), but the table scan + secret decryption
 * runs once per render pass. The cache is scoped to a single server request, and
 * `cache()` wrapping this synchronous function keeps it synchronous. A UI change
 * still takes effect immediately: mutations go through {@link setConfig} and call
 * `revalidatePath`, and the post-mutation re-render is a fresh request/cache
 * scope - it never reads through the pre-mutation memo. (Every writer here also
 * reads config *before* it writes, never after, so no in-request staleness.)
 */
export const getConfig: () => HeadtowerConfig = cache(() => {
  assertServer();
  const stored = readAllSettings();

  // --- Headscale connection ---
  const dbUrl = stored[SETTING_KEYS.headscaleUrl];
  const envUrl = readEnv("HEADSCALE_URL");
  const url = dbUrl ?? envUrl;

  const dbKey = stored[SETTING_KEYS.headscaleApiKey];
  const apiKey = dbKey != null ? decodeSecret(dbKey) : (readEnv("HEADSCALE_API_KEY") ?? null);

  // The public login-server URL tailnet clients use (`tailscale up --login-server`),
  // distinct from `url` above which may be an internal-only admin API address. No
  // env bootstrap - DB only - and falls back to `url` itself when unset/empty.
  const dbLoginServerUrl = stored[SETTING_KEYS.headscaleLoginServerUrl];

  let headscale: HeadscaleConfig | null = null;
  let headscaleSource: ConfigSource = "none";
  if (url && apiKey) {
    const normalized = tryNormalizeUrl(url);
    if (normalized) {
      const loginServerUrl =
        (dbLoginServerUrl ? tryNormalizeUrl(dbLoginServerUrl) : null) ?? normalized;
      headscale = { url: normalized, apiKey, loginServerUrl };
      headscaleSource = dbUrl != null || dbKey != null ? "db" : "env";
    }
  }

  // --- OIDC provider (per-field DB override; enabled only when complete) ---
  const issuer = stored[SETTING_KEYS.oidcIssuer] ?? readEnv("HEADTOWER_OIDC_ISSUER");
  const clientId = stored[SETTING_KEYS.oidcClientId] ?? readEnv("HEADTOWER_OIDC_CLIENT_ID");
  const dbSecret = stored[SETTING_KEYS.oidcClientSecret];
  const clientSecret =
    dbSecret != null ? decodeSecret(dbSecret) : (readEnv("HEADTOWER_OIDC_CLIENT_SECRET") ?? null);

  let oidc: OidcConfig | null = null;
  let oidcSource: ConfigSource = "none";
  if (issuer && clientId && clientSecret) {
    const normalizedIssuer = tryNormalizeUrl(issuer);
    if (normalizedIssuer) {
      oidc = { issuer: normalizedIssuer, clientId, clientSecret };
      const fromDb =
        stored[SETTING_KEYS.oidcIssuer] != null ||
        stored[SETTING_KEYS.oidcClientId] != null ||
        dbSecret != null;
      oidcSource = fromDb ? "db" : "env";
    }
  }

  // --- Agent sidecar (env fallback -> DB override; "enabled" defaults to
  // "a url is configured" when no explicit agent.enabled setting exists) ---
  const dbAgentUrl = stored[SETTING_KEYS.agentUrl];
  const rawAgentUrl = dbAgentUrl ?? readEnv("HEADTOWER_AGENT_URL");
  const agentUrl = rawAgentUrl ? tryNormalizeUrl(rawAgentUrl) : null;

  const dbAgentSecret = stored[SETTING_KEYS.agentSshSecret];
  const agentSshSecret =
    dbAgentSecret != null
      ? decodeSecret(dbAgentSecret)
      : (readEnv("HEADTOWER_AGENT_SSH_SECRET") ?? null);

  const dbAgentEnabled = stored[SETTING_KEYS.agentEnabled];
  const agentEnabled = dbAgentEnabled != null ? dbAgentEnabled === "true" : agentUrl !== null;

  const agent: AgentConfig = { url: agentUrl, enabled: agentEnabled, sshSecret: agentSshSecret };

  return {
    headscale,
    oidc,
    agent,
    sources: { headscale: headscaleSource, oidc: oidcSource },
  };
});

/** Convenience: is a usable Headscale connection configured (env or DB)? */
export function hasHeadscaleConnection(): boolean {
  return getConfig().headscale !== null;
}

/* --------------------------------------------------------------------------
 * Writes
 * -------------------------------------------------------------------------- */

/** A partial configuration update. Pass `null` for a section to clear it. */
export interface ConfigInput {
  headscale?: {
    url: string;
    apiKey: string;
    /**
     * The public login-server URL. `undefined` leaves the stored value
     * untouched; `null` (or an empty string) clears it back to the fallback
     * (`url`); a non-empty string validates and stores it.
     */
    loginServerUrl?: string | null;
  } | null;
  oidc?: { issuer: string; clientId: string; clientSecret: string } | null;
  agent?: {
    url: string;
    /** `undefined` leaves the stored value untouched (so "enabled" keeps
     *  defaulting to "a url is configured"). */
    enabled?: boolean;
    /** `undefined` leaves the stored secret untouched; `null`/"" clears it. */
    sshSecret?: string | null;
  } | null;
}

/**
 * Persist a configuration change to the DB store. Validates URLs (throwing
 * {@link ConfigError} on bad input) and encodes secrets. Only the sections
 * present in `input` are touched; passing `null` for a section deletes it,
 * falling back to the env bootstrap (if any) on the next read.
 */
export function setConfig(input: ConfigInput): void {
  assertServer();

  if (input.headscale !== undefined) {
    if (input.headscale === null) {
      deleteSetting(SETTING_KEYS.headscaleUrl);
      deleteSetting(SETTING_KEYS.headscaleApiKey);
      deleteSetting(SETTING_KEYS.headscaleLoginServerUrl);
    } else {
      const apiKey = input.headscale.apiKey.trim();
      if (!apiKey) throw new ConfigError("A Headscale API key is required.");
      writeSetting(
        SETTING_KEYS.headscaleUrl,
        normalizeUrl("Headscale URL", input.headscale.url),
      );
      writeSetting(SETTING_KEYS.headscaleApiKey, encodeSecret(apiKey));

      if (input.headscale.loginServerUrl !== undefined) {
        const loginServerUrl = input.headscale.loginServerUrl?.trim();
        if (!loginServerUrl) {
          deleteSetting(SETTING_KEYS.headscaleLoginServerUrl);
        } else {
          writeSetting(
            SETTING_KEYS.headscaleLoginServerUrl,
            normalizeUrl("Login server URL", loginServerUrl),
          );
        }
      }
    }
  }

  if (input.oidc !== undefined) {
    if (input.oidc === null) {
      deleteSetting(SETTING_KEYS.oidcIssuer);
      deleteSetting(SETTING_KEYS.oidcClientId);
      deleteSetting(SETTING_KEYS.oidcClientSecret);
    } else {
      const clientId = input.oidc.clientId.trim();
      const clientSecret = input.oidc.clientSecret.trim();
      if (!clientId || !clientSecret) {
        throw new ConfigError("An OIDC client id and secret are both required.");
      }
      writeSetting(SETTING_KEYS.oidcIssuer, normalizeUrl("OIDC issuer", input.oidc.issuer));
      writeSetting(SETTING_KEYS.oidcClientId, clientId);
      writeSetting(SETTING_KEYS.oidcClientSecret, encodeSecret(clientSecret));
    }
  }

  if (input.agent !== undefined) {
    if (input.agent === null) {
      deleteSetting(SETTING_KEYS.agentUrl);
      deleteSetting(SETTING_KEYS.agentSshSecret);
      deleteSetting(SETTING_KEYS.agentEnabled);
    } else {
      const url = input.agent.url.trim();
      if (!url) throw new ConfigError("An agent URL is required.");
      writeSetting(SETTING_KEYS.agentUrl, normalizeUrl("Agent URL", url));

      if (input.agent.sshSecret !== undefined) {
        const sshSecret = input.agent.sshSecret?.trim();
        if (!sshSecret) {
          deleteSetting(SETTING_KEYS.agentSshSecret);
        } else {
          writeSetting(SETTING_KEYS.agentSshSecret, encodeSecret(sshSecret));
        }
      }

      if (input.agent.enabled !== undefined) {
        writeSetting(SETTING_KEYS.agentEnabled, input.agent.enabled ? "true" : "false");
      }
    }
  }
}

/** Read a raw setting value straight from the store (no decoding). */
export function getRawSetting(key: string): string | null {
  assertServer();
  return readSetting(key);
}

/** Write a raw setting value straight to the store (no encoding/validation). */
export function setRawSetting(key: string, value: string): void {
  assertServer();
  writeSetting(key, value);
}

/* --------------------------------------------------------------------------
 * Live connection probe
 * -------------------------------------------------------------------------- */

export type ConnectionTestStatus =
  | "connected"
  | "unauthorized"
  | "unreachable"
  | "error";

export interface ConnectionTestResult {
  ok: boolean;
  status: ConnectionTestStatus;
  /** One-line, operator-facing outcome. Never contains the API key. */
  message: string;
  /** HTTP status when the server answered. */
  httpStatus?: number;
}

const PROBE_TIMEOUT_MS = 5_000;

/**
 * Probe a Headscale connection without persisting anything - the /setup wizard's
 * "Test" button. Hits the admin API with the supplied credentials and classifies
 * the outcome: reachable + key accepted, reachable but key rejected, an unexpected
 * status, or not reachable at all.
 */
export async function testHeadscaleConnection(
  url: string,
  apiKey: string,
): Promise<ConnectionTestResult> {
  assertServer();

  let normalized: string;
  try {
    normalized = normalizeUrl("Headscale URL", url);
  } catch (error) {
    return {
      ok: false,
      status: "error",
      message: error instanceof ConfigError ? error.message : "Enter a valid URL.",
    };
  }
  if (!apiKey.trim()) {
    return { ok: false, status: "error", message: "Enter an API key to test." };
  }

  const host = hostOf(normalized);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(`${normalized}/api/v1/apikey`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });

    if (response.ok) {
      return {
        ok: true,
        status: "connected",
        message: `Connected to ${host}. The API key was accepted.`,
        httpStatus: response.status,
      };
    }
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        status: "unauthorized",
        message: `Reached ${host}, but it rejected the API key (HTTP ${response.status}).`,
        httpStatus: response.status,
      };
    }
    return {
      ok: false,
      status: "error",
      message: `Reached ${host}, but the admin API returned HTTP ${response.status}.`,
      httpStatus: response.status,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      return {
        ok: false,
        status: "unreachable",
        message: `No response from ${host} within ${PROBE_TIMEOUT_MS / 1000}s.`,
      };
    }
    return {
      ok: false,
      status: "unreachable",
      message: `Couldn't reach ${host}: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
