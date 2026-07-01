"use server";

/**
 * Dashboard Server Actions (server-only).
 *
 * Two different kinds of action share this file because they both belong to the
 * dashboard's data, not because they're alike:
 *
 *   captureTailnetSnapshot   automatic telemetry, not an operator command. The
 *                            dashboard calls it on every load with the counts it
 *                            just read from Headscale, and it appends at most one
 *                            sample every few minutes (see `@/lib/db/snapshots`).
 *                            It records no operator intent, so unlike the
 *                            mutation below it is neither RBAC-gated nor audited -
 *                            every authenticated view should contribute a data
 *                            point regardless of role. The whole thing is
 *                            best-effort: any failure (e.g. operator mode with no
 *                            local database) resolves to an empty history so the
 *                            dashboard renders unaffected.
 *
 *   setAgentEnabled          an operator mutation from the Agent widget's on/off
 *                            toggle. Gated on `settings.write` and audited like
 *                            the mutating actions elsewhere in the console.
 */

import { revalidatePath } from "next/cache";
import { listSnapshots, recordSnapshotThrottled } from "@/lib/db/snapshots";
import { ConfigError, getConfig, setConfig } from "@/lib/config";
import { audit, authorize } from "@/lib/authz";

const PATH = "/dashboard";

/** A snapshot projected for charts: epoch-ms `ts` plus the three counts. */
export interface SnapshotPoint {
  ts: number;
  total: number;
  online: number;
  users: number;
}

/** How far back the returned history reaches. */
const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Record the current tailnet counts (throttled) and return the recent history,
 * oldest-first, ready for a LineChart. Never throws: on any error the history
 * comes back empty and the caller degrades to "not enough data yet".
 */
export async function captureTailnetSnapshot(input: {
  total: number;
  online: number;
  users: number;
}): Promise<SnapshotPoint[]> {
  try {
    await recordSnapshotThrottled(input);
    const rows = await listSnapshots({
      sinceMs: Date.now() - HISTORY_WINDOW_MS,
      limit: 1000,
    });
    return rows.map((row) => ({
      ts: row.ts.getTime(),
      total: row.total,
      online: row.online,
      users: row.users,
    }));
  } catch {
    return [];
  }
}

/** Result of {@link setAgentEnabled}. */
export type SetAgentEnabledState =
  | { status: "success"; enabled: boolean }
  | { status: "error"; error: string };

/**
 * Flip the agent sidecar on or off, keeping its configured URL unchanged. Gated
 * on `settings.write` - the dashboard only renders the toggle for a session that
 * holds it, but the action re-checks, since a client is never trusted on its own.
 * Refuses when no agent URL is configured yet (setConfig requires one); that
 * state only ever offers a read-only readout in the widget anyway.
 */
export async function setAgentEnabled(
  enabled: boolean,
): Promise<SetAgentEnabledState> {
  const gate = await authorize("settings.write");
  if (!gate.ok) return { status: "error", error: gate.reason };

  const current = getConfig().agent;
  if (!current.url) {
    return { status: "error", error: "No agent URL is configured yet." };
  }

  try {
    setConfig({ agent: { url: current.url, enabled } });
  } catch (err) {
    return {
      status: "error",
      error: err instanceof ConfigError ? err.message : "Couldn't update the agent.",
    };
  }

  await audit(gate.session, {
    action: enabled ? "agent.enable" : "agent.disable",
    targetType: "config",
    targetName: "agent",
  });
  revalidatePath(PATH);
  return { status: "success", enabled };
}
