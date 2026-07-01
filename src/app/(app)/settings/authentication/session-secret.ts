/**
 * Session-secret status - a pure, server-only helper shared by the
 * Authentication page (to display) and its actions (to guard).
 *
 * OIDC sign-in signs its `ht_session` cookie with HEADTOWER_SESSION_SECRET.
 * Unlike the rest of the config this one is ENV-ONLY: `proxy.ts` verifies the
 * cookie before the app - and so before any DB read - so the secret can't be set
 * from the UI. Enabling OIDC without it would lock everyone out, so we surface
 * its state and refuse to flip modes until it is present and long enough.
 *
 * Not a "use server" module: it exports plain values, imported only by server code.
 */

/** Minimum HS256 key length, mirroring `@/lib/auth/session-token`. */
export const MIN_SESSION_SECRET_LENGTH = 32;

export type SessionSecretStatus = "ok" | "short" | "missing";

export interface SessionSecretState {
  status: SessionSecretStatus;
  /** Length of the configured secret (0 when unset). Never the value itself. */
  length: number;
}

/** Classify HEADTOWER_SESSION_SECRET without ever returning the value. */
export function sessionSecretState(): SessionSecretState {
  const raw = process.env.HEADTOWER_SESSION_SECRET?.trim() ?? "";
  if (!raw) return { status: "missing", length: 0 };
  if (raw.length < MIN_SESSION_SECRET_LENGTH) {
    return { status: "short", length: raw.length };
  }
  return { status: "ok", length: raw.length };
}
