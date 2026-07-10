"use server";

/**
 * Sign-out (Server Action).
 *
 * Deletes the current server-side session row and clears the `ht_session`
 * cookie, then returns to the sign-in page. Safe to call when already signed
 * out (no-op delete). In operator mode there is nothing to clear, so it simply
 * returns to the console root.
 */

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { endSession } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";

export async function logout(): Promise<void> {
  const session = await getSession();

  // Operator mode has no session to end; just go home.
  if (session?.user.method !== "oidc") {
    redirect("/");
  }

  await endSession();
  // Same stable account id (`app_user.id`) the mutations and the login callback
  // record, so the audit actor filter groups this person's whole history - login,
  // logout, and every action - under one identity, resolved to a name at render.
  await recordAudit({
    actor: session.user.id,
    action: "auth.logout",
    targetType: "user",
    targetId: session.user.id,
    targetName: session.user.name,
  });

  redirect("/login");
}
