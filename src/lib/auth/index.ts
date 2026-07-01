/**
 * Headtower authentication - the session surface (server-only).
 *
 * Two modes, one API. {@link getSession}/{@link requireSession} keep the same
 * shape and call sites regardless of how the operator authenticated:
 *
 *   OPERATOR mode - OIDC is not configured. A configured HEADSCALE_API_KEY (a
 *     successful {@link getConfig}) implies the single operator session, with
 *     the default RBAC role. No cookies, no accounts - the today behaviour.
 *
 *   OIDC mode - `config.oidc` is set. The session comes from the signed
 *     `ht_session` cookie and its backing `session` row, resolved by
 *     {@link loadSession} to a real `app_user` (id, name, email, picture, role).
 *
 * Either way the result is a {@link Session}: a single principal carrying a
 * stable id, a display name, how it authenticated, and an RBAC {@link Role}.
 * Missing/invalid config is "unauthenticated" (null), not an error, so callers
 * branch cleanly; genuine programming errors still propagate.
 *
 * SERVER-ONLY. The route gate lives in `proxy.ts`; this is the secure check used
 * inside Server Components, Route Handlers, and Server Actions.
 */

import { ConfigError, getConfig } from "@/lib/config";
import { type Role } from "@/lib/rbac";
import { loadSession } from "./session";

/** How a session was established. */
export type AuthMethod = "api_key" | "oidc";

export interface SessionUser {
  /** Stable id for the principal: "operator", or an `app_user.id` under OIDC. */
  readonly id: string;
  /** Display name shown in the console. */
  readonly name: string;
  /** How this session was authenticated. */
  readonly method: AuthMethod;
  /** Account email, when known (OIDC only). */
  readonly email?: string | null;
  /** Avatar URL, when known (OIDC only). */
  readonly picture?: string | null;
}

export interface Session {
  readonly user: SessionUser;
  /** The principal's RBAC role; drives capability checks via `@/lib/rbac`. */
  readonly role: Role;
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
 * In OIDC mode the cookie-backed session is the sole authority. In operator mode
 * a successful `getConfig()` (which guarantees HEADSCALE_API_KEY) implies the
 * operator. Bad config is treated as unauthenticated; real programming errors
 * (e.g. a server-only violation) still throw.
 */
export async function getSession(): Promise<Session | null> {
  let config;
  try {
    config = getConfig();
  } catch (error) {
    if (error instanceof ConfigError) return null;
    throw error;
  }

  if (config.oidc) {
    const loaded = await loadSession();
    if (!loaded) return null;
    return {
      user: {
        id: loaded.user.id,
        name: loaded.user.name,
        method: "oidc",
        email: loaded.user.email,
        picture: loaded.user.picture,
      },
      role: loaded.role,
    };
  }

  // Single-operator mode: whoever can reach the console owns the deployment, so
  // grant the full owner role (every capability, including settings.write).
  return { user: OPERATOR, role: "owner" };
}

/**
 * Return the current session, or throw {@link UnauthorizedError}.
 * Use in any server path that must not run without an authenticated principal.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    throw new UnauthorizedError(
      "No authenticated operator. Configure HEADSCALE_API_KEY (operator mode), " +
        "or sign in when OIDC is enabled.",
    );
  }
  return session;
}
