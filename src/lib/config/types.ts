/**
 * Configuration types + error - a PURE module (no db, no node imports).
 *
 * Split out from ./index so these can be imported anywhere, including client
 * components that render a configuration error. Importing them from ./index would
 * drag the DB-backed config layer (and so `node:sqlite`) into the browser bundle.
 * ./index re-exports all of these, so server callers can keep importing from
 * `@/lib/config` unchanged.
 */

/** Thrown when a supplied configuration value is malformed (e.g. a bad URL). */
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

/** Where a resolved value came from: the DB store, the env bootstrap, or nowhere. */
export type ConfigSource = "db" | "env" | "none";

export interface HeadtowerConfig {
  /** The Headscale connection, or null when it has not been configured yet. */
  readonly headscale: HeadscaleConfig | null;
  /** OIDC provider config, or null when running in operator (API-key) mode. */
  readonly oidc: OidcConfig | null;
  /** Provenance of each part, for the setup UI to explain what it inherited. */
  readonly sources: {
    readonly headscale: ConfigSource;
    readonly oidc: ConfigSource;
  };
}
