"use server";

/**
 * Server Actions for the Agent view.
 *
 * Two operations, both gated on `settings.write`:
 *
 *   probeAgent   live, read-only `/healthz` probe (persists nothing) - powers
 *                the "Re-test" button so an operator can confirm the sidecar
 *                is reachable without saving anything first.
 *   saveAgent    validate + persist via setConfig, then revalidate. URL and the
 *                enabled flag are always written; the SSH secret follows
 *                `setConfig`'s own three-state contract - `null` keeps the
 *                stored secret untouched, "" clears it, and a non-empty string
 *                rotates it. The raw secret never leaves the server either way.
 */

import { revalidatePath } from "next/cache";
import { ConfigError, setConfig } from "@/lib/config";
import { getAgentHealth, type AgentHealth } from "@/lib/agent";
import { audit, authorize } from "@/lib/authz";

const PATH = "/settings/agent";

/** Result of {@link saveAgent}. */
export type SaveAgentState =
  | { status: "success" }
  | { status: "error"; error: string };

export interface SaveAgentInput {
  url: string;
  enabled: boolean;
  /** `null` leaves the stored secret untouched; "" clears it; a value rotates it. */
  sshSecret: string | null;
}

/**
 * Live-probe the agent's `/healthz` without persisting anything - the "Re-test"
 * button. Reuses the same reader the settings page renders on load.
 */
export async function probeAgent(): Promise<AgentHealth> {
  const gate = await authorize("settings.write");
  if (!gate.ok) return { reachable: false, error: gate.reason };
  return getAgentHealth();
}

/**
 * Persist agent settings (URL, enabled flag, SSH secret) and revalidate the
 * view so the readout reflects the new state.
 */
export async function saveAgent(input: SaveAgentInput): Promise<SaveAgentState> {
  const gate = await authorize("settings.write");
  if (!gate.ok) return { status: "error", error: gate.reason };

  const url = input.url.trim();
  if (!url) return { status: "error", error: "Enter the agent URL." };

  // `null` leaves the stored secret untouched (`undefined` for setConfig);
  // "" clears it; anything else rotates it.
  const sshSecret = input.sshSecret === null ? undefined : input.sshSecret.trim();
  const secretChanged = sshSecret !== undefined;

  try {
    setConfig({ agent: { url, enabled: input.enabled, sshSecret } });
  } catch (err) {
    return {
      status: "error",
      error: err instanceof ConfigError ? err.message : "Couldn't save the agent settings.",
    };
  }

  await audit(gate.session, {
    action: "config.agent",
    targetType: "config",
    targetName: hostOf(url),
    detail: { host: hostOf(url), enabled: input.enabled, secretChanged },
  });
  revalidatePath(PATH);
  return { status: "success" };
}

/** Host (and port) of a URL for the audit label; falls back to the raw string. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
