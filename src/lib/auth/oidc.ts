/**
 * OIDC client + login-transaction helpers (server-only).
 *
 * Wraps openid-client v6 for an authorization-code + PKCE sign-in against the
 * issuer in {@link import("@/lib/config").OidcConfig}. Two responsibilities:
 *
 *   1. Discovery. {@link getOidcConfiguration} runs OpenID discovery against the
 *      issuer once per server process and caches the resulting `Configuration`.
 *   2. The login transaction. A single sign-in spans two requests (the redirect
 *      out to the IdP and the callback back), so the PKCE `code_verifier`, the
 *      CSRF `state`, and the replay-guard `nonce` are stashed in short-lived
 *      httpOnly cookies by {@link beginLogin} and read + cleared by the callback
 *      via {@link readLoginTransaction} / {@link clearLoginTransaction}.
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

if (typeof window !== "undefined") {
  throw new Error(
    "@/lib/auth/oidc is server-only and must not be imported into a client component.",
  );
}

/** Scopes requested at sign-in: identity plus the profile/email claims we store. */
const OIDC_SCOPE = "openid profile email";

/** httpOnly cookies that carry the in-flight login transaction across the round-trip. */
const STATE_COOKIE = "ht_oidc_state";
const VERIFIER_COOKIE = "ht_oidc_verifier";
const NONCE_COOKIE = "ht_oidc_nonce";
const RETURN_COOKIE = "ht_oidc_return";

/** Every login-transaction cookie, so the callback can clear them on its response. */
export const LOGIN_TRANSACTION_COOKIES = [
  STATE_COOKIE,
  VERIFIER_COOKIE,
  NONCE_COOKIE,
  RETURN_COOKIE,
] as const;

/** A login attempt has ten minutes to complete before its transaction cookies lapse. */
const TRANSACTION_TTL_SECONDS = 60 * 10;

/** True only when the cookies must be HTTPS-only (production); allows http on dev. */
function secureCookies(): boolean {
  return process.env.NODE_ENV === "production";
}

/** The OIDC config, or a thrown error when sign-in is invoked without it. */
function requireOidc(): OidcConfig {
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

/** Whether OIDC mode is active. Never throws; treats bad config as "disabled". */
export function isOidcEnabled(): boolean {
  try {
    return getConfig().oidc !== null;
  } catch {
    return false;
  }
}

// Discovery is a network round-trip; do it once per process and reuse the
// Configuration. Cache the promise so concurrent first-callers share one flight.
let configurationCache: Promise<client.Configuration> | null = null;

/** Discover (and cache) the provider Configuration for the configured issuer. */
export function getOidcConfiguration(): Promise<client.Configuration> {
  if (!configurationCache) {
    const oidc = requireOidc();
    // A bare client_secret string defaults openid-client to client_secret_post.
    configurationCache = client
      .discovery(new URL(oidc.issuer), oidc.clientId, oidc.clientSecret)
      .catch((error) => {
        // Don't cache a failed discovery; let the next attempt retry.
        configurationCache = null;
        throw error;
      });
  }
  return configurationCache;
}

/** Build the callback `redirect_uri`, which must match exactly at exchange time. */
export function callbackUrl(origin: string): string {
  return `${origin}/login/callback`;
}

/** The claims we persist about a signed-in account. */
export interface OidcIdentity {
  sub: string;
  name: string;
  email: string | null;
  picture: string | null;
}

/**
 * Begin a sign-in: mint PKCE/state/nonce, stash them in httpOnly cookies, and
 * return the IdP authorization URL to redirect the user-agent to.
 *
 * @param origin Externally visible `scheme://host` (see {@link import("./request").originFromHeaders}).
 * @param returnTo Optional in-app path to land on after a successful callback.
 */
export async function beginLogin(
  origin: string,
  returnTo?: string,
): Promise<string> {
  const configuration = await getOidcConfiguration();

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
  if (returnTo) jar.set(RETURN_COOKIE, returnTo, options);

  return authorizationUrl.toString();
}

/** The transaction values needed to validate a callback. */
export interface LoginTransaction {
  state: string;
  codeVerifier: string;
  nonce: string;
  returnTo: string | null;
}

/** Read the in-flight login transaction from cookies, or null if absent/expired. */
export async function readLoginTransaction(): Promise<LoginTransaction | null> {
  const jar = await cookies();
  const state = jar.get(STATE_COOKIE)?.value;
  const codeVerifier = jar.get(VERIFIER_COOKIE)?.value;
  const nonce = jar.get(NONCE_COOKIE)?.value;
  if (!state || !codeVerifier || !nonce) return null;
  return { state, codeVerifier, nonce, returnTo: jar.get(RETURN_COOKIE)?.value ?? null };
}

/**
 * Complete the authorization-code grant: exchange the callback URL for tokens
 * (validating `state`, the PKCE verifier, and the ID-Token `nonce`), then
 * resolve the signed-in identity from the ID-Token claims, backfilled by the
 * UserInfo endpoint when profile/email/picture are absent.
 */
export async function completeLogin(
  currentUrl: URL,
  transaction: LoginTransaction,
): Promise<OidcIdentity> {
  const configuration = await getOidcConfiguration();

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
