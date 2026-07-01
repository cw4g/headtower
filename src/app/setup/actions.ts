"use server";

/**
 * First-run setup actions (Server Actions).
 *
 * Two operations, both gated to the unconfigured (first-run) state so they can't
 * be used to probe arbitrary hosts from, or silently re-point, a live instance:
 *
 *   testConnectionAction   live, read-only probe of a URL + API key (the wizard's
 *                          "Test" button); persists nothing
 *   completeSetupAction    validate + persist the whole connection via setConfig,
 *                          then send the operator into the console
 *
 * Persistence is atomic on finish: the wizard collects everything client-side and
 * only writes once, so a half-finished wizard never leaves a partial config.
 */

import { redirect } from "next/navigation";
import {
  getConfig,
  setConfig,
  testHeadscaleConnection,
  type ConnectionTestResult,
} from "@/lib/config";
import { recordAudit } from "@/lib/audit";

/** Live-probe a candidate connection. Refused once the app is already set up. */
export async function testConnectionAction(input: {
  url: string;
  apiKey: string;
}): Promise<ConnectionTestResult> {
  if (getConfig().headscale) {
    return {
      ok: false,
      status: "error",
      message: "Headtower is already configured.",
    };
  }
  return testHeadscaleConnection(input.url, input.apiKey);
}

export interface CompleteSetupInput {
  headscale: { url: string; apiKey: string };
  /** OIDC provider, or null for operator (API-key) mode. */
  oidc: { issuer: string; clientId: string; clientSecret: string } | null;
}

export type CompleteSetupResult = { ok: false; error: string };

/**
 * Persist the wizard's result and enter the console. On success this redirects
 * (so it does not return); it only returns on a validation failure so the wizard
 * can surface the reason inline.
 */
export async function completeSetupAction(
  input: CompleteSetupInput,
): Promise<CompleteSetupResult> {
  // Already configured: nothing to persist; just enter the console.
  if (getConfig().headscale) redirect("/");

  try {
    setConfig({ headscale: input.headscale, oidc: input.oidc });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not save the configuration.",
    };
  }

  // Best-effort trail; there is no signed-in principal yet during first-run.
  await recordAudit({
    actor: "operator",
    action: "config.setup",
    targetType: "config",
    targetName: hostOf(input.headscale.url),
    detail: {
      headscale: hostOf(input.headscale.url),
      identity: input.oidc ? "oidc" : "operator-mode",
    },
  }).catch(() => {});

  // Fresh connection is live: enter the console (which routes on to /login when
  // OIDC was just enabled, since there is no session yet).
  redirect("/");
}

/** Host of a URL for the audit label; falls back to the raw string. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
