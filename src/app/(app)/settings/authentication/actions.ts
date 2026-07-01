"use server";

/**
 * Server Action for the Authentication view.
 *
 * The on/off switch for sign-in - WHICH providers exist is Settings > Identity
 * providers' job (see `@/lib/auth/oidc-providers`); this only flips whether
 * sign-in is required at all:
 *
 *   OPERATOR mode - turn every provider off (the legacy slot, if still
 *                   unmigrated, and every `oidc_provider` row). No sign-in;
 *                   the single implicit operator returns.
 *   OIDC mode     - turn every existing provider back on. Refused when none
 *                   exist yet (add one on Identity providers first) or when
 *                   HEADTOWER_SESSION_SECRET isn't set long enough, since
 *                   sign-in signs its cookie with it and enabling without it
 *                   would lock everyone out on the next request.
 *
 * Gated on `settings.write` and audited.
 */

import { revalidatePath } from "next/cache";
import { getConfig, setConfig } from "@/lib/config";
import {
  listProviders,
  setProviderEnabled,
} from "@/lib/auth/oidc-providers";
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

export type SaveAuthInput = { mode: "operator" | "oidc" };

/** Flip whether sign-in is required, across every configured provider. */
export async function saveAuthentication(
  input: SaveAuthInput,
): Promise<SaveAuthState> {
  const gate = await authorize("settings.write");
  if (!gate.ok) return { status: "error", error: gate.reason };

  return input.mode === "operator" ? disableAll(gate.session) : enableAll(gate.session);
}

async function disableAll(session: Session): Promise<SaveAuthState> {
  // The legacy slot may still be unmigrated on an older install; clear it too
  // so "operator mode" is a true kill switch regardless of where a provider
  // happens to be stored.
  if (getConfig().oidc) setConfig({ oidc: null });
  for (const provider of listProviders()) {
    if (provider.enabled) setProviderEnabled(provider.id, false);
  }

  await audit(session, {
    action: "config.authentication",
    targetType: "config",
    targetName: "operator",
    detail: { mode: "operator" },
  });
  revalidatePath(PATH);
  revalidatePath("/settings/identity-providers");
  return { status: "success", mode: "operator" };
}

async function enableAll(session: Session): Promise<SaveAuthState> {
  const providers = listProviders();
  if (providers.length === 0) {
    return {
      status: "error",
      error: "Add an identity provider first, then turn this on.",
    };
  }

  // Don't let an operator strand themselves: sign-in needs the session secret.
  const secret = sessionSecretState();
  if (secret.status !== "ok") {
    return {
      status: "error",
      error:
        secret.status === "missing"
          ? `Set HEADTOWER_SESSION_SECRET (at least ${MIN_SESSION_SECRET_LENGTH} characters) before turning this on, or sign-in will lock everyone out.`
          : `HEADTOWER_SESSION_SECRET is too short (${secret.length} chars). Use at least ${MIN_SESSION_SECRET_LENGTH} characters before turning this on.`,
    };
  }

  for (const provider of providers) {
    if (!provider.enabled) setProviderEnabled(provider.id, true);
  }

  await audit(session, {
    action: "config.authentication",
    targetType: "config",
    targetName: "oidc",
    detail: { mode: "oidc", providers: providers.length },
  });
  revalidatePath(PATH);
  revalidatePath("/settings/identity-providers");
  return { status: "success", mode: "oidc" };
}
