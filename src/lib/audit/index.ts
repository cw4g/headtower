/**
 * Headtower audit trail (server-only).
 *
 * The thin, typed layer over the `audit_log` table. Mutating Server Actions
 * call {@link recordAudit} after a successful Headscale change so the console
 * keeps an honest history of who did what; views call {@link listAudit} to read
 * it back with filters and pagination.
 *
 *   await recordAudit({ actor: session.user.id, action: "node.rename",
 *                       targetType: "node", targetId: id, targetName: name,
 *                       detail: { from, to } });
 *
 *   const page = await listAudit({ action: "node.rename", limit: 50 });
 *
 * SERVER-ONLY by virtue of importing `@/lib/db` (`node:sqlite`).
 *
 * Exposed surface:
 *   types     RecordAuditInput, ListAuditFilter, AuditPage, AuditEntry
 *   functions recordAudit(input), listAudit(filter?)
 */

import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { auditLog, db, type AuditDetail, type AuditEntry } from "@/lib/db";

export type { AuditEntry } from "@/lib/db";

/** Fields accepted when writing an audit entry. `ts` is stamped automatically. */
export interface RecordAuditInput {
  /** Who acted: an `app_user` id, or "operator" in single-operator mode. */
  actor: string;
  /** Verb-like action key, e.g. "node.rename" or "user.create". */
  action: string;
  /** Kind of thing acted on, e.g. "node" | "user" | "policy". */
  targetType?: string | null;
  /** Stable id of the target. */
  targetId?: string | null;
  /** Human label of the target at action time. */
  targetName?: string | null;
  /** Structured parameters / before-after, stored as JSON. */
  detail?: AuditDetail | null;
  /** Originating client IP, when known. */
  ip?: string | null;
}

/** Filters for {@link listAudit}. All optional; omitted filters match all. */
export interface ListAuditFilter {
  action?: string;
  targetType?: string;
  actor?: string;
  /** Page size, clamped to 1..{@link MAX_LIMIT}. Defaults to {@link DEFAULT_LIMIT}. */
  limit?: number;
  /** Rows to skip, for paging. Defaults to 0. */
  offset?: number;
}

/** A page of audit entries plus the total matching the same filters. */
export interface AuditPage {
  entries: AuditEntry[];
  /** Total rows matching the filters, ignoring pagination. */
  total: number;
  /** Effective page size after clamping. */
  limit: number;
  /** Effective offset after clamping. */
  offset: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Append one entry to the audit log. Returns the stored row (with id + ts). */
export async function recordAudit(input: RecordAuditInput): Promise<AuditEntry> {
  const [entry] = await db
    .insert(auditLog)
    .values({
      actor: input.actor,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      targetName: input.targetName ?? null,
      detail: input.detail ?? null,
      ip: input.ip ?? null,
    })
    .returning();
  return entry;
}

/**
 * Read entries newest-first, narrowed by the given filters and paginated.
 * Returns the page plus the unpaginated total so callers can render counts.
 */
export async function listAudit(filter: ListAuditFilter = {}): Promise<AuditPage> {
  const where = buildWhere(filter);
  const limit = clamp(filter.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = Math.max(0, Math.trunc(filter.offset ?? 0));

  const entries = await db
    .select()
    .from(auditLog)
    .where(where)
    // Tie-break on id so rows sharing a millisecond stay in insert order.
    .orderBy(desc(auditLog.ts), desc(auditLog.id))
    .limit(limit)
    .offset(offset);

  const totalRow = await db
    .select({ value: count() })
    .from(auditLog)
    .where(where)
    .get();

  return { entries, total: totalRow?.value ?? 0, limit, offset };
}

/** Combine the active filters into a single predicate, or `undefined` for none. */
function buildWhere(filter: ListAuditFilter): SQL | undefined {
  const conditions: SQL[] = [];
  if (filter.action) conditions.push(eq(auditLog.action, filter.action));
  if (filter.targetType) conditions.push(eq(auditLog.targetType, filter.targetType));
  if (filter.actor) conditions.push(eq(auditLog.actor, filter.actor));
  if (conditions.length === 0) return undefined;
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
