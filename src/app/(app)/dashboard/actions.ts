"use server";

/**
 * Dashboard Server Action: record a throttled tailnet snapshot.
 *
 * Unlike the mutating actions elsewhere in the console, this is automatic
 * telemetry rather than an operator command: the dashboard calls it on load with
 * the counts it just read from Headscale, and it appends at most one sample every
 * few minutes (see `@/lib/db/snapshots`). It is therefore neither RBAC-gated nor
 * audited - it records no operator intent, and every authenticated view should
 * contribute a data point regardless of role.
 *
 * The whole thing is best-effort: any failure (e.g. operator mode with no local
 * database) resolves to an empty history so the dashboard renders unaffected.
 */

import { listSnapshots, recordSnapshotThrottled } from "@/lib/db/snapshots";

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
