/**
 * Headtower authentication - MINIMAL, single-operator stage (server-only).
 *
 * Today Headtower runs in "operator mode": whoever holds the configured
 * HEADSCALE_API_KEY is the single authenticated operator. There are no per-user
 * accounts, cookies, or sessions yet.
 *
 * The {@link Session} shape and the get/require split are deliberately the same
 * ones a real auth system uses, so dropping in OIDC + a session store later
 * only changes the bodies of {@link getSession}/{@link requireSession}, not
 * their call sites. Both are async now so they can read `cookies()`/`headers()`
 * (async in Next 16) without a signature change.
 *
 * TODO(auth): real sessions
 *   - OIDC login (HEADTOWER_OIDC_* in config): code exchange -> session cookie
 *   - signed/encrypted session cookie + store (src/lib/db) with expiry
 *   - per-user identity, roles/RBAC, and audit attribution
 *   - requireSession() should redirect("/login") instead of throwing once a
 *     login route exists
 */

import { ConfigError, getConfig } from "@/lib/config";

/** How a session was established. Extend with "oidc" when sign-in lands. */
export type AuthMethod = "api_key";

export interface SessionUser {
  /** Stable id for the principal. The single operator today. */
  readonly id: string;
  /** Display name shown in the console. */
  readonly name: string;
  /** How this session was authenticated. */
  readonly method: AuthMethod;
}

export interface Session {
  readonly user: SessionUser;
}

/** Thrown by {@link requireSession} when there is no authenticated operator. */
export class UnauthorizedError extends Error {
  constructor(message = "Not authenticated.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** The implicit identity in single-operator (API-key) mode. */
const OPERATOR: SessionUser = {
  id: "operator",
  name: "Operator",
  method: "api_key",
};

/**
 * Return the current session, or null when unauthenticated.
 *
 * Operator-mode rule: a configured HEADSCALE_API_KEY is exactly one
 * authenticated operator. A successful `getConfig()` guarantees that key is
 * present, so it implies the operator session. Missing/invalid config is
 * treated as unauthenticated (null) rather than an error, so callers can
 * branch cleanly; genuine programming errors (e.g. server-only violations)
 * still propagate.
 */
export async function getSession(): Promise<Session | null> {
  try {
    getConfig();
    return { user: OPERATOR };
  } catch (error) {
    if (error instanceof ConfigError) return null;
    throw error;
  }
}

/**
 * Return the current session, or throw {@link UnauthorizedError}.
 * Use in any server path that must not run without an operator.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    throw new UnauthorizedError(
      "No authenticated operator. Configure HEADSCALE_API_KEY (operator mode), " +
        "or sign in once OIDC is enabled.",
    );
  }
  return session;
}
