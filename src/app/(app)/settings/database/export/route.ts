/**
 * Full database export (Route Handler).
 *
 * Downloads Headtower's own SQLite database as a single attachment - a
 * complete backup of accounts, sessions, in-app settings (including the
 * encoded Headscale API key and OIDC secrets), additional identity providers,
 * the audit trail, and tailnet-size snapshots. Headscale's own data (nodes,
 * users, routes, policy) lives in Headscale and is never in this file.
 *
 *   GET /settings/database/export
 *
 * EXPORT ONLY: there is deliberately no matching import/restore endpoint.
 * Restoring a database is destructive (it would clobber every session,
 * account, and secret on this deployment) and needs a careful, reviewed
 * design of its own - out of scope here.
 *
 * Gated on `settings.write`, not the weaker `settings.read`: the export
 * contains secrets, so only a role that can already change settings may read
 * them back out this way.
 *
 * `node:sqlite`'s `DatabaseSync` has no `serialize()` (unlike better-sqlite3;
 * confirmed absent at runtime on the Node version this app targets - see the
 * report for how that was checked), so the export reads the on-disk file
 * directly instead. The connection runs in WAL mode (see `@/lib/db/client`'s
 * `PRAGMA journal_mode = WAL`), which means a recent commit can live only in
 * the `-wal` file rather than the main `.db` file. `PRAGMA
 * wal_checkpoint(TRUNCATE)` folds those frames back into the main file and
 * empties the WAL immediately before the read. Node is single-threaded and
 * both the checkpoint and `readFileSync` are synchronous - no other request's
 * write can interleave between them - so the bytes read are a consistent
 * snapshot, equivalent to what `serialize()` would have produced.
 */

import { readFileSync } from "node:fs";
import { UnauthorizedError } from "@/lib/auth";
import { audit, authorize } from "@/lib/authz";
import { sqlite } from "@/lib/db";

// Always read the live file at request time; never cache or prerender.
export const dynamic = "force-dynamic";

const DEFAULT_DB_PATH = "./data/headtower.db";

/**
 * Mirrors the private `resolveDbPath` in `@/lib/db/client` (not exported from
 * `@/lib/db`'s public surface, so duplicated here rather than reaching past
 * it): the same env var, the same default.
 */
function resolveDbPath(): string {
  const raw = process.env.HEADTOWER_DB_PATH?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_DB_PATH;
}

function plainText(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function GET(): Promise<Response> {
  let gate;
  try {
    gate = await authorize("settings.write");
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return plainText("Unauthorized\n", 401);
    }
    throw error;
  }
  if (!gate.ok) {
    return plainText(`${gate.reason}\n`, 403);
  }

  let bytes: Buffer;
  try {
    // `sqlite` is the shared, lazily-opened connection (see @/lib/db/client);
    // touching it here also guarantees the file exists even on a fresh
    // deployment that has never been queried yet.
    sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    bytes = readFileSync(resolveDbPath());
  } catch (error) {
    console.error("settings/database/export: failed to read the database file", error);
    return plainText("Couldn't read the local database file.\n", 500);
  }

  await audit(gate.session, {
    action: "config.database_export",
    targetType: "config",
    targetName: "headtower.db",
    detail: { bytes: bytes.byteLength },
  });

  const filename = `headtower-backup-${new Date().toISOString().slice(0, 10)}.db`;
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
