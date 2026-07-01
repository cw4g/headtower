/**
 * OIDC client + login-transaction helpers (server-only).
 *
 * Wraps openid-client v6 for an authorization-code + PKCE sign-in. Any number
 * of providers can be live at once: the "legacy" provider (`oidc.issuer` /
 * `oidc.client_id` / `oidc.client_secret` in `app_settings`, see
 * {@link import("@/lib/config").OidcConfig} - kept unchanged for backward
 * compatibility with existing IdP registrations) plus any rows in the
 * `oidc_provider` table (see `@/lib/auth/oidc-providers`). Every provider
 * shares the SAME registered `redirect_uri` (`callbackUrl` below never varies
 * by provider) - which one handled a given login is tracked entirely by a
 * cookie, not by the callback URL, so adding a provider never requires
 * touching its IdP-side redirect URI registration.
 *
 * Three responsibilities:
 *
 *   1. Discovery. {@link getOidcConfiguration} runs OpenID discovery against a
 *      provider's issuer once per server process and caches the resulting
 *      `Configuration`, keyed by provider id.
 *   2. The login transaction. A single sign-in spans two requests (the redirect
 *      out to the IdP and the callback back), so the PKCE `code_verifier`, the
 *      CSRF `state`, the replay-guard `nonce`, and which provider is in flight
 *      are stashed in short-lived httpOnly cookies by {@link beginLogin} and
 *      read + cleared by the callback via {@link readLoginTransaction} /
 *      {@link clearLoginTransaction}.
 *   3. {@link listLoginProviders} - the login page's button list: the legacy
 *      provider (if configured) followed by every enabled `oidc_provider` row.
 *
 * We never hand-roll crypto: PKCE, state, and nonce are minted by openid-client,
 * the token exchange and ID-Token validation are performed by it, and the
 * session cookie is signed with `jose` (see ./session-token).
 *
 * SERVER-ONLY. Importing this into a client component throws.
 */

import * as client from "openid-client";
import { cookies } from "next/headers";
import { getConfig, type OidcConfig } from "@/lib/config";
import {
  getProviderSecrets,
  hasEnabledProvider,
  listEnabledProvidersForLogin,
  type OidcProviderLoginEntry,
} from "./oidc-providers";

if (typeof window !== "undefined") {
  throw new Error(
    "@/lib/auth/oidc is server-only and must not be imported into a client component.",
  );
}

/** Scopes requested at sign-in: identity plus the profile/email claims we store. */
const OIDC_SCOPE = "openid profile email";

/** The sentinel provider id for the legacy single-provider config in `app_settings`. */
export const LEGACY_PROVIDER_ID = "legacy";

/** httpOnly cookies that carry the in-flight login transaction across the round-trip. */
const STATE_COOKIE = "ht_oidc_state";
const VERIFIER_COOKIE = "ht_oidc_verifier";
const NONCE_COOKIE = "ht_oidc_nonce";
const RETURN_COOKIE = "ht_oidc_return";
const PROVIDER_COOKIE = "ht_oidc_provider";

/** Every login-transaction cookie, so the callback can clear them on its response. */
export const LOGIN_TRANSACTION_COOKIES = [
  STATE_COOKIE,
  VERIFIER_COOKIE,
  NONCE_COOKIE,
  RETURN_COOKIE,
  PROVIDER_COOKIE,
] as const;

/** A login attempt has ten minutes to complete before its transaction cookies lapse. */
const TRANSACTION_TTL_SECONDS = 60 * 10;

/** True only when the cookies must be HTTPS-only (production); allows http on dev. */
function secureCookies(): boolean {
  return process.env.NODE_ENV === "production";
}

/** The legacy OIDC config, or a thrown error when it is invoked without one. */
function requireLegacyOidc(): OidcConfig {
  const { oidc } = getConfig();
  if (!oidc) {
    throw new Error(
      "OIDC sign-in was invoked but no provider is configured. Set " +
        "HEADTOWER_OIDC_ISSUER, HEADTOWER_OIDC_CLIENT_ID, and " +
        "HEADTOWER_OIDC_CLIENT_SECRET to enable it.",
    );
  }
  return oidc;
}

/** A resolved provider's issuer/client config, whichever store it came from. */
interface ResolvedProvider {
  issuer: string;
  clientId: string;
  clientSecret: string;
}

/** Resolve a provider by id (the legacy sentinel or an `oidc_provider` row id). */
function resolveProvider(providerId: string): ResolvedProvider {
  if (providerId === LEGACY_PROVIDER_ID) return requireLegacyOidc();
  const provider = getProviderSecrets(providerId);
  if (!provider) {
    throw new Error(
      `OIDC sign-in was invoked for an unknown or disabled provider (${providerId}).`,
    );
  }
  return provider;
}

/** Whether OIDC mode is active on ANY provider. Never throws; treats bad config as "disabled". */
export function isOidcEnabled(): boolean {
  try {
    return getConfig().oidc !== null || hasEnabledProvider();
  } catch {
    return false;
  }
}

/** The login page's button list: legacy first (if configured), then every enabled row. */
export function listLoginProviders(): OidcProviderLoginEntry[] {
  const providers: OidcProviderLoginEntry[] = [];
  try {
    if (getConfig().oidc) {
      providers.push({ id: LEGACY_PROVIDER_ID, name: "Single sign-on" });
    }
  } catch {
    // Bad legacy config reads as "not configured" - same treatment as isOidcEnabled.
  }
  providers.push(...listEnabledProvidersForLogin());
  return providers;
}

// Discovery is a network round-trip; do it once per provider per process and
// reuse the Configuration. Cache the promise so concurrent first-callers for
// the same provider share one flight.
const configurationCache = new Map<string, Promise<client.Configuration>>();

/** Discover (and cache) a provider's Configuration for its issuer. */
export function getOidcConfiguration(
  providerId: string,
): Promise<client.Configuration> {
  const cached = configurationCache.get(providerId);
  if (cached) return cached;

  const provider = resolveProvider(providerId);
  // A bare client_secret string defaults openid-client to client_secret_post.
  const discovery = client
    .discovery(new URL(provider.issuer), provider.clientId, provider.clientSecret)
    .catch((error) => {
      // Don't cache a failed discovery; let the next attempt retry.
      configurationCache.delete(providerId);
      throw error;
    });
  configurationCache.set(providerId, discovery);
  return discovery;
}

/**
 * Build the callback `redirect_uri`, which must match exactly at exchange
 * time. The SAME URL for every provider - which provider is in flight is
 * tracked by {@link PROVIDER_COOKIE}, not by this URL.
 */
export function callbackUrl(origin: string): string {
  // Include the app's base path (e.g. "/admin") so the redirect_uri points at
  // where the callback route is actually served behind the reverse proxy.
  const basePath = process.env.HEADTOWER_BASE_PATH?.trim() || "";
  return `${origin}${basePath}/login/callback`;
}

/** The claims we persist about a signed-in account. */
export interface OidcIdentity {
  sub: string;
  name: string;
  email: string | null;
  picture: string | null;
}

/**
 * Begin a sign-in: mint PKCE/state/nonce, stash them (plus which provider is
 * in flight) in httpOnly cookies, and return the IdP authorization URL to
 * redirect the user-agent to.
 *
 * @param origin Externally visible `scheme://host` (see {@link import("./request").originFromHeaders}).
 * @param providerId The legacy sentinel or an `oidc_provider` row id.
 * @param returnTo Optional in-app path to land on after a successful callback.
 */
export async function beginLogin(
  origin: string,
  providerId: string,
  returnTo?: string,
): Promise<string> {
  const configuration = await getOidcConfiguration(providerId);

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();

  const authorizationUrl = client.buildAuthorizationUrl(configuration, {
    redirect_uri: callbackUrl(origin),
    scope: OIDC_SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });

  const jar = await cookies();
  const options = {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: TRANSACTION_TTL_SECONDS,
  };
  jar.set(STATE_COOKIE, state, options);
  jar.set(VERIFIER_COOKIE, codeVerifier, options);
  jar.set(NONCE_COOKIE, nonce, options);
  jar.set(PROVIDER_COOKIE, providerId, options);
  if (returnTo) jar.set(RETURN_COOKIE, returnTo, options);

  return authorizationUrl.toString();
}

/** The transaction values needed to validate a callback. */
export interface LoginTransaction {
  state: string;
  codeVerifier: string;
  nonce: string;
  /** Which provider this transaction is for; falls back to the legacy sentinel
   *  for a transaction begun just before a deploy that added this cookie. */
  providerId: string;
  returnTo: string | null;
}

/** Read the in-flight login transaction from cookies, or null if absent/expired. */
export async function readLoginTransaction(): Promise<LoginTransaction | null> {
  const jar = await cookies();
  const state = jar.get(STATE_COOKIE)?.value;
  const codeVerifier = jar.get(VERIFIER_COOKIE)?.value;
  const nonce = jar.get(NONCE_COOKIE)?.value;
  if (!state || !codeVerifier || !nonce) return null;
  return {
    state,
    codeVerifier,
    nonce,
    providerId: jar.get(PROVIDER_COOKIE)?.value ?? LEGACY_PROVIDER_ID,
    returnTo: jar.get(RETURN_COOKIE)?.value ?? null,
  };
}

/**
 * Complete the authorization-code grant: exchange the callback URL for tokens
 * (validating `state`, the PKCE verifier, and the ID-Token `nonce`) against the
 * transaction's provider, then resolve the signed-in identity from the
 * ID-Token claims, backfilled by the UserInfo endpoint when profile/email/
 * picture are absent.
 */
export async function completeLogin(
  currentUrl: URL,
  transaction: LoginTransaction,
): Promise<OidcIdentity> {
  const configuration = await getOidcConfiguration(transaction.providerId);

  const tokens = await client.authorizationCodeGrant(configuration, currentUrl, {
    pkceCodeVerifier: transaction.codeVerifier,
    expectedState: transaction.state,
    expectedNonce: transaction.nonce,
  });

  const claims = tokens.claims();
  if (!claims?.sub) {
    throw new Error("The OIDC provider returned no subject (`sub`) claim.");
  }
  const sub = claims.sub;

  let name = asString(claims.name);
  let email = asString(claims.email);
  let picture = asString(claims.picture);

  // Fall back to UserInfo only when the ID Token lacks the display claims.
  if (!name || !email || !picture) {
    try {
      const info = await client.fetchUserInfo(configuration, tokens.access_token, sub);
      name = name ?? info.name ?? null;
      email = email ?? info.email ?? null;
      picture = picture ?? info.picture ?? null;
    } catch {
      // UserInfo is best-effort enrichment; the ID Token already identifies the user.
    }
  }

  return {
    sub,
    // Always have a legible label: fall back through email to the subject id.
    name: name ?? email ?? sub,
    email: email,
    picture: picture,
  };
}

/** Narrow an unknown claim to a non-empty string, or null. */
function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
