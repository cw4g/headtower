/**
 * Tailnet snapshot history - a lightweight coverage time-series (server-only).
 *
 * The dashboard records one row of tailnet size (total / online / users) each
 * time it loads, throttled to at most one every few minutes, so the console can
 * chart online-over-time without any background job. This module owns that
 * write path plus the reads the dashboard uses to draw the line:
 *
 *   recordSnapshot           append one sample now
 *   recordSnapshotThrottled  append only if the last sample is old enough
 *   latestSnapshot           the most recent sample (for the throttle window)
 *   listSnapshots            samples in a window, oldest-first (chart order)
 *   countSnapshots           how many rows exist, for the settings readout
 *
 * It talks to the async Drizzle instance (`db`) and imports `./client` +
 * `./schema` directly rather than the `@/lib/db` barrel, to avoid an import
 * cycle (the barrel re-exports this module).
 *
 * SERVER-ONLY by importing `./client` (`node:sqlite`).
 */

import { count, desc, gte } from "drizzle-orm";
import { db } from "./client";
import { snapshots, type Snapshot } from "./schema";

/** The tailnet counts captured in one sample. */
export interface SnapshotInput {
  total: number;
  online: number;
  users: number;
}

/** Default throttle: at most one recorded sample every five minutes. */
export const SNAPSHOT_MIN_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Hard cap on rows returned by {@link listSnapshots}.
 *
 * Sized against the dashboard's 30-day window and the default 15-minute
 * sampling: 96 samples a day is 2,880 over the window, so the old cap of 2,000
 * would have silently turned a 30-day chart into a 10-day one. 10,000 covers the
 * window down to 5-minute sampling; below that it truncates again, which is the
 * honest limit of reading a whole window into memory. The chart buckets whatever
 * arrives down to ~700 points before drawing, so the row count only costs a
 * read, never legibility.
 */
const MAX_ROWS = 10_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** Append one sample, stamped with the current time. Returns the stored row. */
export async function recordSnapshot(input: SnapshotInput): Promise<Snapshot> {
  const [row] = await db
    .insert(snapshots)
    .values({
      total: Math.max(0, Math.trunc(input.total)),
      online: Math.max(0, Math.trunc(input.online)),
      users: Math.max(0, Math.trunc(input.users)),
    })
    .returning();
  return row;
}

/** The most recent sample, or `undefined` when none has been recorded yet. */
export async function latestSnapshot(): Promise<Snapshot | undefined> {
  return db
    .select()
    .from(snapshots)
    .orderBy(desc(snapshots.ts), desc(snapshots.id))
    .get();
}

/**
 * Append a sample only when the newest one is at least `minIntervalMs` old (or
 * there is none yet). Returns the new row, or `null` when the throttle skips it.
 * This keeps the series sparse enough that dashboard traffic can't flood it.
 */
export async function recordSnapshotThrottled(
  input: SnapshotInput,
  minIntervalMs: number = SNAPSHOT_MIN_INTERVAL_MS,
): Promise<Snapshot | null> {
  const latest = await latestSnapshot();
  if (latest && Date.now() - latest.ts.getTime() < minIntervalMs) return null;
  return recordSnapshot(input);
}

/** Options for {@link listSnapshots}. */
export interface ListSnapshotsOptions {
  /** Only include samples at or after this epoch-ms. Omitted = all history. */
  sinceMs?: number;
  /** Row cap, newest kept, clamped to 1..2000. Defaults to 1000. */
  limit?: number;
}

/**
 * Read samples in the given window, oldest-first so the array feeds straight
 * into a time-series chart. When more than `limit` rows match, the newest are
 * kept (the tail matters most for a live trend).
 */
export async function listSnapshots(
  options: ListSnapshotsOptions = {},
): Promise<Snapshot[]> {
  const limit = clamp(options.limit ?? 1000, 1, MAX_ROWS);
  const rows = await db
    .select()
    .from(snapshots)
    .where(
      options.sinceMs != null
        ? gte(snapshots.ts, new Date(options.sinceMs))
        : undefined,
    )
    // Pull newest-first so `limit` keeps the most recent window, then flip to
    // oldest-first for charting.
    .orderBy(desc(snapshots.ts), desc(snapshots.id))
    .limit(limit);
  return rows.reverse();
}

/**
 * How many samples are stored in total.
 *
 * For the sampling settings readout: an interval is a choice about how fast this
 * number grows, so the number belongs next to the control that sets it.
 */
export async function countSnapshots(): Promise<number> {
  const row = await db.select({ total: count() }).from(snapshots).get();
  return row?.total ?? 0;
}
