/**
 * Server-side session store for OIDC sign-in (server-only).
 *
 * Headtower uses database sessions: the source of truth is a row in the
 * `session` table; the browser only carries a signed JWT (see ./session-token)
 * naming that row. This module owns the lifecycle:
 *
 *   upsertOidcUser   create/refresh the `app_user` for an OIDC identity
 *   startSession     insert a session row + set the signed `ht_session` cookie
 *   loadSession      read the cookie, verify it, load the row + account (secure)
 *   endSession       delete the current row + clear the cookie (sign out)
 *
 * Cookies are set/read with the Next `cookies()` API; the JWT is signed/verified
 * with `jose`. Both `loadSession` and `endSession` are safe no-ops when there is
 * no valid session, so callers don't have to branch on the unauthenticated case.
 *
 * SERVER-ONLY by importing `@/lib/db` (`node:sqlite`).
 */

import { cookies } from "next/headers";
import { eq, lte } from "drizzle-orm";
import { appUser, db, session, type AppUser } from "@/lib/db";
import { DEFAULT_ROLE, isRole, type Role } from "@/lib/rbac";
import type { OidcIdentity } from "./oidc";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  signSessionToken,
  verifySessionToken,
} from "./session-token";

/** True only when the session cookie must be HTTPS-only (production). */
function secureCookies(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Create the `app_user` for an OIDC identity, or refresh an existing one.
 *
 * Keyed on the OIDC `sub`. A new account is minted with {@link DEFAULT_ROLE};
 * a returning one keeps its role (an owner may have promoted it) while its
 * display fields and `last_login_at` are refreshed from the provider.
 */
export async function upsertOidcUser(identity: OidcIdentity): Promise<AppUser> {
  const now = new Date();
  // Bootstrap: the first account on a fresh deployment becomes the owner, so
  // there is always someone who can manage settings + roles. Once an owner
  // exists, new accounts get the default role and returning ones keep theirs.
  const ownerExists = !!(await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.role, "owner"))
    .get());

  const existing = await db
    .select()
    .from(appUser)
    .where(eq(appUser.sub, identity.sub))
    .get();

  if (existing) {
    const promote = !ownerExists && existing.role !== "owner";
    const [updated] = await db
      .update(appUser)
      .set({
        name: identity.name,
        email: identity.email,
        picture: identity.picture,
        lastLoginAt: now,
        ...(promote ? { role: "owner" } : {}),
      })
      .where(eq(appUser.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(appUser)
    .values({
      sub: identity.sub,
      name: identity.name,
      email: identity.email,
      picture: identity.picture,
      role: ownerExists ? DEFAULT_ROLE : "owner",
      lastLoginAt: now,
    })
    .returning();
  return created;
}

/** A freshly opened session: the signed cookie value and its shared expiry. */
export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

/**
 * Open a session for an account: insert a session row and sign a JWT naming it.
 * Returns the cookie value + expiry WITHOUT writing the cookie, so the caller
 * controls how it is attached (e.g. a Route Handler sets it on its own
 * `NextResponse` so it survives a redirect). The cookie and row share one expiry.
 */
export async function createSession(userId: string): Promise<CreatedSession> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  const [row] = await db
    .insert(session)
    .values({ userId, expiresAt })
    .returning();

  const token = await signSessionToken({ sub: userId, sid: row.id });
  return { token, expiresAt };
}

/** The attributes the `ht_session` cookie is always written with. */
export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

/** A loaded session: the backing account plus the session row id. */
export interface LoadedSession {
  user: AppUser;
  role: Role;
  sessionId: string;
}

/**
 * The secure session check: verify the cookie's signature, confirm the named
 * session row exists and is unexpired, and load the owning account. Returns null
 * for any missing/forged/expired session. Expired rows are pruned on the way.
 */
export async function loadSession(): Promise<LoadedSession | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const row = await db.select().from(session).where(eq(session.id, payload.sid)).get();
  if (!row) return null;

  if (row.expiresAt.getTime() <= Date.now()) {
    // Lapsed: drop the row so it can't be reused, and treat as signed out.
    await db.delete(session).where(eq(session.id, row.id));
    return null;
  }

  const user = await db.select().from(appUser).where(eq(appUser.id, row.userId)).get();
  if (!user) return null;

  // The role column is free text on disk; fall back to the default if unknown.
  const role: Role = isRole(user.role) ? user.role : DEFAULT_ROLE;
  return { user, role, sessionId: row.id };
}

/**
 * Sign out: delete the current session row (if the cookie names a valid one) and
 * clear the cookie. Safe to call when already signed out.
 */
export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const payload = await verifySessionToken(token);
    if (payload) {
      await db.delete(session).where(eq(session.id, payload.sid));
    }
  }
  jar.delete(SESSION_COOKIE);
}

/** Best-effort prune of every expired session row. Cheap housekeeping. */
export async function purgeExpiredSessions(): Promise<void> {
  await db.delete(session).where(lte(session.expiresAt, new Date()));
}
