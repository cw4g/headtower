/**
 * Audit trail CSV export (Route Handler).
 *
 * Streams the audit rows matching the same filters as the Audit view as a
 * downloadable `text/csv` attachment. The rows are paged out of the local store
 * in batches so a large trail never has to be buffered in memory at once.
 *
 *   GET /audit/export?action=node.rename&targetType=node&actor=operator
 *
 * Server-only by importing `@/lib/audit` (which pulls `node:sqlite`).
 */

import { requireSession, UnauthorizedError } from "@/lib/auth";
import { listAudit } from "@/lib/audit";
import type { AuditEntry } from "@/lib/db";
import { humanizeAction, isoTimestamp } from "../format";

// Always run at request time against the live store; never cache or prerender.
export const dynamic = "force-dynamic";

/** Page size used to walk the full result set behind the stream. */
const BATCH = 200;

const COLUMNS = [
  "timestamp",
  "actor",
  "action",
  "action_label",
  "target_type",
  "target_id",
  "target_name",
  "ip",
  "detail",
] as const;

export async function GET(request: Request): Promise<Response> {
  try {
    await requireSession();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return new Response("Unauthorized\n", {
        status: 401,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    throw error;
  }

  const { searchParams } = new URL(request.url);
  const filter = {
    action: param(searchParams.get("action")),
    targetType: param(searchParams.get("targetType")),
    actor: param(searchParams.get("actor")),
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(csvRow(COLUMNS as readonly string[])));
        let offset = 0;
        for (;;) {
          const { entries, total } = await listAudit({ ...filter, limit: BATCH, offset });
          for (const entry of entries) {
            controller.enqueue(encoder.encode(csvRow(cellsFor(entry))));
          }
          offset += entries.length;
          if (entries.length < BATCH || offset >= total) break;
        }
      } catch {
        // The store became unreachable mid-stream: stop cleanly. The header (and
        // any rows already flushed) still make a valid, if partial, CSV.
      } finally {
        controller.close();
      }
    },
  });

  const filename = `headtower-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** The ordered CSV cells for one audit entry, matching {@link COLUMNS}. */
function cellsFor(entry: AuditEntry): string[] {
  return [
    isoTimestamp(entry.ts),
    entry.actor,
    entry.action,
    humanizeAction(entry.action),
    entry.targetType ?? "",
    entry.targetId ?? "",
    entry.targetName ?? "",
    entry.ip ?? "",
    entry.detail ? safeJson(entry.detail) : "",
  ];
}

/** Encode one CSV record (RFC 4180): every cell quoted, quotes doubled, CRLF. */
function csvRow(cells: readonly string[]): string {
  return cells.map(csvCell).join(",") + "\r\n";
}

function csvCell(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Treat blank query values as "no filter". */
function param(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
