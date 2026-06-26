/**
 * Headtower configuration (server-only).
 *
 * Reads and validates the operator's environment into a single typed object.
 * Headscale stays the source of truth for tailnet data; this only tells
 * Headtower how to reach it (and, later, how to authenticate operators).
 *
 *   Required:  HEADSCALE_URL, HEADSCALE_API_KEY
 *   Optional:  HEADTOWER_OIDC_ISSUER, HEADTOWER_OIDC_CLIENT_ID,
 *              HEADTOWER_OIDC_CLIENT_SECRET   (all-or-nothing, wired up later)
 *
 * Server-only: these values include secrets and must never reach the browser
 * bundle. They are read from non-`NEXT_PUBLIC_` vars (stripped client-side) and
 * `getConfig()` additionally refuses to run in a browser context. If the
 * `server-only` package is added later, prefer `import "server-only"` here.
 *
 * TODO(config): layer an optional config file (HEADTOWER_CONFIG_PATH) under env,
 * plus server-name / DNS settings, once those features land.
 */

/** Thrown when the environment is missing or malformed. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface HeadscaleConfig {
  /** Base URL of the Headscale instance, normalized without a trailing slash. */
  readonly url: string;
  /** API key used to authenticate against the Headscale REST API. */
  readonly apiKey: string;
}

export interface OidcConfig {
  /** Issuer URL of the OpenID provider (e.g. Pocket ID or a generic IdP). */
  readonly issuer: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface HeadtowerConfig {
  readonly headscale: HeadscaleConfig;
  /** OIDC provider config, or null when running in operator (API-key) mode. */
  readonly oidc: OidcConfig | null;
}

function assertServer(): void {
  // Intentionally NOT a ConfigError: a server-only violation is a programming
  // mistake that should always surface loudly, not be swallowed as "no config".
  if (typeof window !== "undefined") {
    throw new Error(
      "getConfig() is server-only and was called in a browser context. " +
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

function requireEnv(name: string): string {
  const value = readEnv(name);
  if (value === undefined) {
    throw new ConfigError(
      `Missing required environment variable ${name}. ` +
        `Set ${name} so Headtower can reach your Headscale control plane.`,
    );
  }
  return value;
}

/** Validate an http(s) URL and drop any trailing slash for clean path joins. */
function normalizeUrl(name: string, raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ConfigError(`${name} is not a valid URL: ${JSON.stringify(raw)}.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ConfigError(
      `${name} must be an http(s) URL, got "${parsed.protocol}".`,
    );
  }
  return parsed.toString().replace(/\/+$/, "");
}

/**
 * OIDC is optional and all-or-nothing: configure all three vars or none.
 * A partial set is a misconfiguration, so we name the gap rather than silently
 * half-enabling sign-in.
 */
function readOidc(): OidcConfig | null {
  const issuer = readEnv("HEADTOWER_OIDC_ISSUER");
  const clientId = readEnv("HEADTOWER_OIDC_CLIENT_ID");
  const clientSecret = readEnv("HEADTOWER_OIDC_CLIENT_SECRET");

  const provided = [issuer, clientId, clientSecret].filter(
    (v): v is string => v !== undefined,
  );
  if (provided.length === 0) return null; // Operator (API-key) mode, fine today.
  if (provided.length < 3) {
    throw new ConfigError(
      "OIDC is partially configured. Set all of HEADTOWER_OIDC_ISSUER, " +
        "HEADTOWER_OIDC_CLIENT_ID, and HEADTOWER_OIDC_CLIENT_SECRET, or none.",
    );
  }
  return {
    issuer: normalizeUrl("HEADTOWER_OIDC_ISSUER", issuer as string),
    clientId: clientId as string,
    clientSecret: clientSecret as string,
  };
}

// Parsed once per server process. Env is fixed at runtime, so caching is safe;
// the module is re-evaluated on dev hot reload, which resets this.
let cached: HeadtowerConfig | null = null;

/**
 * Read, validate, and return the Headtower configuration.
 * Throws {@link ConfigError} (naming the offending variable) on bad input.
 */
export function getConfig(): HeadtowerConfig {
  assertServer();
  if (cached) return cached;

  cached = {
    headscale: {
      url: normalizeUrl("HEADSCALE_URL", requireEnv("HEADSCALE_URL")),
      apiKey: requireEnv("HEADSCALE_API_KEY"),
    },
    oidc: readOidc(),
  };
  return cached;
}
