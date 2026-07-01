"use server";

/**
 * Server Actions for the Authentication view.
 *
 * The setup wizard's identity step, made editable without a restart. One action
 * flips the whole sign-in model:
 *
 *   OPERATOR mode - clear the OIDC config; the single implicit operator returns.
 *   OIDC mode     - persist issuer / client id / secret; sign-in goes through the
 *                   provider with per-account roles. A blank secret keeps the
 *                   stored one (edit issuer/id without re-pasting the secret).
 *
 * Two guards make the switch safe rather than a footgun:
 *   - Enabling OIDC is refused unless HEADTOWER_SESSION_SECRET is set and long
 *     enough, since sign-in signs its cookie with it - otherwise everyone locks
 *     out on the next request.
 *   - Disabling OIDC is refused when it is pinned by the env bootstrap, because
 *     deleting the DB override just falls back to env (which the UI can't unset).
 *
 * Gated on `settings.write` and audited. The client secret never leaves the
 * server in either direction.
 */

import { revalidatePath } from "next/cache";
import { ConfigError, getConfig, setConfig } from "@/lib/config";
import type { Session } from "@/lib/auth";
import { audit, authorize } from "@/lib/authz";
import {
  MIN_SESSION_SECRET_LENGTH,
  sessionSecretState,
} from "./session-secret";

const PATH = "/settings/authentication";

export type SaveAuthState =
  | { status: "success"; mode: "operator" | "oidc" }
  | { status: "error"; error: string };

export type SaveAuthInput =
  | { mode: "operator" }
  | { mode: "oidc"; issuer: string; clientId: string; clientSecret: string };

/** Persist the identity model, guarding both directions of the switch. */
export async function saveAuthentication(
  input: SaveAuthInput,
): Promise<SaveAuthState> {
  const gate = await authorize("settings.write");
  if (!gate.ok) return { status: "error", error: gate.reason };

  if (input.mode === "operator") {
    return disableOidc(gate.session);
  }
  return enableOidc(gate.session, input);
}

async function disableOidc(session: Session): Promise<SaveAuthState> {
  const before = getConfig();
  if (!before.oidc) {
    return { status: "success", mode: "operator" }; // Already operator mode.
  }

  setConfig({ oidc: null });

  // Deleting the DB override reverts to the env bootstrap; if that still defines
  // OIDC, the switch didn't take. Be honest instead of silently no-op'ing.
  if (getConfig().oidc) {
    return {
      status: "error",
      error:
        "OIDC is configured through environment variables, which can't be cleared here. " +
        "Remove HEADTOWER_OIDC_* from the environment and restart to use operator mode.",
    };
  }

  await audit(session, {
    action: "config.authentication",
    targetType: "config",
    targetName: "operator",
    detail: { mode: "operator" },
  });
  revalidatePath(PATH);
  return { status: "success", mode: "operator" };
}

async function enableOidc(
  session: Session,
  input: Extract<SaveAuthInput, { mode: "oidc" }>,
): Promise<SaveAuthState> {
  // Don't let an operator strand themselves: OIDC sign-in needs the session secret.
  const secret = sessionSecretState();
  if (secret.status !== "ok") {
    return {
      status: "error",
      error:
        secret.status === "missing"
          ? `Set HEADTOWER_SESSION_SECRET (at least ${MIN_SESSION_SECRET_LENGTH} characters) before enabling OIDC, or sign-in will lock everyone out.`
          : `HEADTOWER_SESSION_SECRET is too short (${secret.length} chars). Use at least ${MIN_SESSION_SECRET_LENGTH} characters before enabling OIDC.`,
    };
  }

  const issuer = input.issuer.trim();
  const clientId = input.clientId.trim();
  if (!issuer || !clientId) {
    return { status: "error", error: "Enter the issuer URL and client ID." };
  }

  let clientSecret = input.clientSecret.trim();
  const rotating = clientSecret.length > 0;
  if (!clientSecret) {
    // Blank secret: keep the stored one so issuer/id can be edited on their own.
    const current = getConfig().oidc;
    if (!current) {
      return { status: "error", error: "Enter the client secret." };
    }
    clientSecret = current.clientSecret;
  }

  try {
    setConfig({ oidc: { issuer, clientId, clientSecret } });
  } catch (err) {
    return {
      status: "error",
      error: err instanceof ConfigError ? err.message : "Couldn't save the provider.",
    };
  }

  await audit(session, {
    action: "config.authentication",
    targetType: "config",
    targetName: hostOf(issuer),
    detail: { mode: "oidc", issuer: hostOf(issuer), rotatedSecret: rotating },
  });
  revalidatePath(PATH);
  return { status: "success", mode: "oidc" };
}

/** Host of a URL for the audit label; falls back to the raw string. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
