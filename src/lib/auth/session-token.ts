/**
 * Session token + secret primitives (server-only, dependency-light).
 *
 * This module imports ONLY `jose`. It pulls in no database and no Next request
 * APIs, which keeps it safe to import from `proxy.ts` (the lean request boundary
 * that runs before the app) as well as from the db-backed session store.
 *
 * The session cookie is a compact HS256 JWS carrying the Headtower account id
 * (`sub` = `app_user.id`) and the backing server-side session row id (`sid`).
 * Signing and verification use {@link getSessionSecret}; we never hand-roll
 * crypto.
 */

import { SignJWT, jwtVerify } from "jose";

/** Name of the signed session cookie set after a successful sign-in. */
export const SESSION_COOKIE = "ht_session";

/** Session lifetime. Mirrored by the JWT `exp` and the db session row expiry. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

/** HS256 wants a high-entropy key; refuse anything obviously too short. */
const MIN_SECRET_LENGTH = 32;

export interface SessionTokenPayload {
  /** `app_user.id` of the signed-in Headtower account. */
  sub: string;
  /** `session.id` of the backing server-side session row. */
  sid: string;
}

let cachedSecret: Uint8Array | null = null;

/**
 * The HS256 signing key from `HEADTOWER_SESSION_SECRET`.
 *
 * Throws a clear, non-swallowed error when the secret is unset or too short.
 * OIDC mode requires it; this is the "clear error if missing" guarantee, and it
 * deliberately is NOT a {@link import("@/lib/config").ConfigError} so it surfaces
 * loudly rather than being treated as "unauthenticated".
 */
export function getSessionSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const raw = process.env.HEADTOWER_SESSION_SECRET?.trim();
  if (!raw) {
    throw new Error(
      "HEADTOWER_SESSION_SECRET is not set. OIDC sign-in signs session cookies " +
        "with it. Set HEADTOWER_SESSION_SECRET to a random string of at least " +
        `${MIN_SECRET_LENGTH} characters.`,
    );
  }
  if (raw.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `HEADTOWER_SESSION_SECRET is too short (${raw.length} chars). Use at least ` +
        `${MIN_SECRET_LENGTH} characters of high-entropy randomness.`,
    );
  }
  cachedSecret = new TextEncoder().encode(raw);
  return cachedSecret;
}

/** Sign a session payload into a compact HS256 JWT. */
export async function signSessionToken(
  payload: SessionTokenPayload,
  ttlSeconds: number = SESSION_TTL_SECONDS,
): Promise<string> {
  return new SignJWT({ sid: payload.sid })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(getSessionSecret());
}

/**
 * Verify a session token's signature and expiry. Returns the payload, or `null`
 * for any malformed/expired/forged token. A missing secret still throws (see
 * {@link getSessionSecret}) so misconfiguration is loud, not silent.
 */
export async function verifySessionToken(
  token: string,
): Promise<SessionTokenPayload | null> {
  // Resolve the secret outside the try so a missing-secret error propagates.
  const secret = getSessionSecret();
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    const { sub, sid } = payload;
    if (typeof sub !== "string" || typeof sid !== "string") return null;
    return { sub, sid };
  } catch {
    return null;
  }
}
