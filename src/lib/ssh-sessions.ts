/**
 * Headtower SSH session log (server-only).
 *
 * The thin, typed layer over the `ssh_session` table. `mintSshToken` (see
 * `@/app/(app)/machines/[id]/terminal/actions`) calls {@link recordSshSession}
 * once it has authorized and validated a connection, so the console keeps a
 * record of who opened a terminal to which device and when; a read-only view
 * calls {@link listSshSessions} to read it back.
 *
 *   await recordSshSession({ actor: actorLabel(session), deviceName: host,
 *                             sshUser: user });
 *
 *   const page = await listSshSessions({ limit: 20 });
 *
 * This is deliberately START-ONLY. A minted token is the closest proxy this
 * app has for "a session began" - the shell itself runs in the Headtower
 * agent's SSH bridge (`agent/ssh.go`), not in this process, and there is no
 * reliable way back here to learn when it ended (the browser tab can close,
 * crash, or lose the network before any signal fires). Rather than persist a
 * guessed end time or duration, this module simply doesn't record one - see
 * the `ssh_session` table's doc comment in `@/lib/db/schema` for the same
 * note. Callers wanting "how long" should treat it as unknown.
 *
 * SERVER-ONLY by virtue of importing `@/lib/db` (`node:sqlite`).
 *
 * Exposed surface:
 *   types     RecordSshSessionInput, ListSshSessionsFilter, SshSessionPage
 *   functions recordSshSession(input), listSshSessions(filter?)
 */

import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { sshSession, type SshSession } from "@/lib/db/schema";

export type { SshSession } from "@/lib/db/schema";

/** Fields accepted when recording a session start. `startedAt` is stamped automatically. */
export interface RecordSshSessionInput {
  /** Who connected: an `app_user` id, or "operator" in single-operator mode. */
  actor: string;
  /** Headscale node id, when known. Omit when only a hostname/IP is available. */
  deviceId?: string | null;
  /** Hostname or tailnet IP the terminal dialed. */
  deviceName: string;
  /** SSH user presented to the target. */
  sshUser: string;
}

/** Filters for {@link listSshSessions}. All optional; omitted filters match all. */
export interface ListSshSessionsFilter {
  actor?: string;
  deviceName?: string;
  /** Page size, clamped to 1..{@link MAX_LIMIT}. Defaults to {@link DEFAULT_LIMIT}. */
  limit?: number;
  /** Rows to skip, for paging. Defaults to 0. */
  offset?: number;
}

/** A page of SSH sessions plus the total matching the same filters. */
export interface SshSessionPage {
  entries: SshSession[];
  /** Total rows matching the filters, ignoring pagination. */
  total: number;
  /** Effective page size after clamping. */
  limit: number;
  /** Effective offset after clamping. */
  offset: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Record that a session started. Best-effort by design: a logging failure
 * must never block an actual SSH connection from working, so this catches
 * its own errors (logging them) instead of throwing - mirroring `audit()`'s
 * `recordAudit` wrapper in `@/lib/authz`, just inlined here since this module
 * has no separate gate/audit split to hang it off of.
 */
export async function recordSshSession(input: RecordSshSessionInput): Promise<void> {
  try {
    await db.insert(sshSession).values({
      actor: input.actor,
      deviceId: input.deviceId ?? null,
      deviceName: input.deviceName,
      sshUser: input.sshUser,
    });
  } catch (err) {
    console.error(`ssh-sessions: failed to record session for "${input.deviceName}"`, err);
  }
}

/**
 * Read sessions newest-first, narrowed by the given filters and paginated.
 * Returns the page plus the unpaginated total so callers can render counts.
 */
export async function listSshSessions(
  filter: ListSshSessionsFilter = {},
): Promise<SshSessionPage> {
  const where = buildWhere(filter);
  const limit = clamp(filter.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = Math.max(0, Math.trunc(filter.offset ?? 0));

  const entries = await db
    .select()
    .from(sshSession)
    .where(where)
    // Tie-break on id so rows sharing a millisecond stay in insert order.
    .orderBy(desc(sshSession.startedAt), desc(sshSession.id))
    .limit(limit)
    .offset(offset);

  const totalRow = await db
    .select({ value: count() })
    .from(sshSession)
    .where(where)
    .get();

  return { entries, total: totalRow?.value ?? 0, limit, offset };
}

/** Combine the active filters into a single predicate, or `undefined` for none. */
function buildWhere(filter: ListSshSessionsFilter): SQL | undefined {
  const conditions: SQL[] = [];
  if (filter.actor) conditions.push(eq(sshSession.actor, filter.actor));
  if (filter.deviceName) conditions.push(eq(sshSession.deviceName, filter.deviceName));
  if (conditions.length === 0) return undefined;
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
