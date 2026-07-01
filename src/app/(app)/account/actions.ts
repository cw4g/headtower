"use server";

/**
 * Server Actions for the self-service Account page.
 *
 * Every mutation here acts on the CALLER's own data - the account's own
 * sessions, its own personal API keys - so each one only requires an
 * authenticated session (`requireSession`), not an RBAC capability: there is
 * nothing to gate when an account can only ever touch rows it owns. Still,
 * every mutation writes an audit entry and revalidates the page, same as the
 * capability-gated actions elsewhere in the console (see `@/lib/authz`).
 *
 * Sessions and personal API keys are both OIDC-only concepts (they key off a
 * real `app_user` row, which single-operator/API-key mode never has), so every
 * action here refuses to run outside `method === "oidc"`.
 */

import { createHash, randomBytes } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { loadSession } from "@/lib/auth/session";
import { audit } from "@/lib/authz";
import { db, session } from "@/lib/db";
import { personalApiKey } from "@/lib/db/schema";
import { resolvePersonalKeyExpiry } from "./expiry-presets";

const PATH = "/account";
const OIDC_ONLY_ERROR =
  "This applies to OIDC sign-in only. Single-operator mode has no per-account data to manage.";

/** Generic result for the row-level revoke actions. */
export type AccountActionState =
  | { status: "success" }
  | { status: "error"; error: string };

/** Result of {@link createPersonalApiKey}, shaped for the create dialog. */
export type CreatePersonalApiKeyState =
  | { status: "idle" }
  | { status: "success"; token: string }
  | { status: "error"; error: string };

/**
 * Revoke one of the caller's own OTHER sessions (delete its row). The DB
 * layer is the source of truth for whether a session is valid (see
 * `loadSession`), so deleting the row is enough: that device's next request
 * finds no matching row and is sent back to sign-in.
 *
 * Refuses to revoke the session making the request - that is "sign out", a
 * different action already offered elsewhere (the account menu, or
 * {@link signOutOtherSessions} below), not a revoke.
 */
export async function revokeSession(id: string): Promise<AccountActionState> {
  const authSession = await requireSession();
  if (authSession.user.method !== "oidc") {
    return { status: "error", error: OIDC_ONLY_ERROR };
  }

  const loaded = await loadSession();
  if (loaded?.sessionId === id) {
    return {
      status: "error",
      error: "That's the session you're using right now - sign out instead.",
    };
  }

  await db
    .delete(session)
    .where(and(eq(session.id, id), eq(session.userId, authSession.user.id)));

  await audit(authSession, {
    action: "session.revoke",
    targetType: "session",
    targetId: id,
  });
  revalidatePath(PATH);
  return { status: "success" };
}

/**
 * Sign out every session but the one making this request - the self-service
 * gap a plain session list without a bulk action would still leave open.
 */
export async function signOutOtherSessions(): Promise<AccountActionState> {
  const authSession = await requireSession();
  if (authSession.user.method !== "oidc") {
    return { status: "error", error: OIDC_ONLY_ERROR };
  }

  const loaded = await loadSession();
  if (!loaded) {
    return { status: "error", error: "Your session could not be verified." };
  }

  await db
    .delete(session)
    .where(and(eq(session.userId, authSession.user.id), ne(session.id, loaded.sessionId)));

  await audit(authSession, {
    action: "session.revoke_others",
    targetType: "user",
    targetId: authSession.user.id,
    targetName: authSession.user.name,
  });
  revalidatePath(PATH);
  return { status: "success" };
}

/**
 * Mint a personal API key: a random token, hashed for storage. Returns the raw
 * token once, for the dialog's one-time reveal - it is never recoverable
 * again, only replaced.
 *
 * KNOWN LIMITATION: this only builds the management surface (mint, list,
 * revoke). Nothing in Headtower yet reads `personal_api_key` to authenticate a
 * request - there is no bearer-token auth middleware in this app to wire it
 * into - so a minted key does not currently grant access to anything. See the
 * table's doc comment in `@/lib/db/schema`.
 */
export async function createPersonalApiKey(
  _prev: CreatePersonalApiKeyState,
  formData: FormData,
): Promise<CreatePersonalApiKeyState> {
  const authSession = await requireSession();
  if (authSession.user.method !== "oidc") {
    return { status: "error", error: OIDC_ONLY_ERROR };
  }

  const name = readString(formData, "name");
  if (!name) {
    return { status: "error", error: "Give the key a name." };
  }

  const expiryId = readString(formData, "expiry");
  const expiresAt = resolvePersonalKeyExpiry(expiryId);
  if (expiresAt === undefined) {
    return { status: "error", error: "Choose how long the key stays valid." };
  }

  const token = generateToken();
  await db.insert(personalApiKey).values({
    userId: authSession.user.id,
    name,
    tokenHash: hashToken(token),
    expiresAt,
  });

  await audit(authSession, {
    action: "personal_key.create",
    targetType: "personal_api_key",
    targetName: name,
    detail: { expiry: expiryId },
  });
  revalidatePath(PATH);
  return { status: "success", token };
}

/** Revoke (delete) one of the caller's own personal API keys. */
export async function revokePersonalApiKey(id: string): Promise<AccountActionState> {
  const authSession = await requireSession();
  if (authSession.user.method !== "oidc") {
    return { status: "error", error: OIDC_ONLY_ERROR };
  }

  await db
    .delete(personalApiKey)
    .where(and(eq(personalApiKey.id, id), eq(personalApiKey.userId, authSession.user.id)));

  await audit(authSession, {
    action: "personal_key.revoke",
    targetType: "personal_api_key",
    targetId: id,
  });
  revalidatePath(PATH);
  return { status: "success" };
}

function readString(formData: FormData, name: string): string {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw.trim() : "";
}

/** A prefixed, high-entropy token - "htpk" (Headtower Personal Key) at a glance. */
function generateToken(): string {
  return `htpk_${randomBytes(24).toString("base64url")}`;
}

/** SHA-256 hex digest, the only form of the token ever written to disk. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
