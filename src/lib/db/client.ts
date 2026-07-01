/**
 * Headtower local database - connection core (server-only).
 *
 * Wraps Node's built-in synchronous SQLite (`node:sqlite` `DatabaseSync`) with
 * Drizzle ORM via its `sqlite-proxy` driver. There is no `node:sqlite` driver
 * in this Drizzle version, so we bridge with a small remote callback:
 *   - Drizzle hands us `(sql, params, method)`.
 *   - We run the prepared statement and, for reads, return rows as positional
 *     arrays (`setReturnArrays(true)`), which is exactly the shape sqlite-proxy
 *     expects: `{ rows: [...] }` for `all`/`values`, a single row array for
 *     `get`, and an empty result for `run`.
 *
 * On first query (never at import time) this opens - creating the parent
 * directory if needed - the DB at `HEADTOWER_DB_PATH` (default
 * `./data/headtower.db`), sets pragmatic pragmas, and runs the idempotent
 * {@link SCHEMA_DDL}. The connection is cached on `globalThis` so dev hot-reload
 * reuses one handle instead of leaking file descriptors.
 *
 * SERVER-ONLY. Importing this (or anything in `@/lib/db`) into a client
 * component pulls `node:sqlite` into the browser bundle and breaks the build.
 *
 * Exports: `db` (Drizzle instance), `sqlite` (raw `DatabaseSync`).
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import type { AsyncRemoteCallback } from "drizzle-orm/sqlite-proxy";
import {
  appSettings,
  appUser,
  auditLog,
  SCHEMA_DDL,
  session,
  snapshots,
} from "./schema";

if (typeof window !== "undefined") {
  // A server-only violation is a programming error: surface it loudly.
  throw new Error(
    "@/lib/db is server-only and was imported into a browser context. " +
      "Query the database from a Server Component, Route Handler, or Server Action.",
  );
}

const DEFAULT_DB_PATH = "./data/headtower.db";

/** Resolve the on-disk path from env, falling back to the default location. */
function resolveDbPath(): string {
  const raw = process.env.HEADTOWER_DB_PATH?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_DB_PATH;
}

/** Create the parent directory for a file-backed database when it is missing. */
function ensureParentDir(path: string): void {
  // In-memory databases have no directory to create.
  if (path === ":memory:" || path.startsWith("file::memory:")) return;
  const dir = dirname(path);
  if (dir && dir !== "." && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/** Open the connection, apply pragmas, and create tables (idempotent). */
function openDatabase(): DatabaseSync {
  const path = resolveDbPath();
  ensureParentDir(path);

  const connection = new DatabaseSync(path);
  // WAL gives readers and a writer concurrency; FK enforcement honours the
  // session -> app_user cascade; busy_timeout avoids spurious "database is
  // locked" under brief contention.
  connection.exec("PRAGMA journal_mode = WAL;");
  connection.exec("PRAGMA foreign_keys = ON;");
  connection.exec("PRAGMA busy_timeout = 5000;");
  connection.exec(SCHEMA_DDL);
  return connection;
}

// Reuse a single connection across dev hot-reloads.
const globalForDb = globalThis as unknown as {
  __headtowerSqlite?: DatabaseSync;
};

/**
 * Open the connection lazily, on first query - never at import time.
 *
 * `next build` collects page configuration by importing every route module; if
 * opening the database were a module-load side effect, that import would touch
 * disk (and, with a leftover WAL-mode file, the parallel build workers would
 * race into "database is locked"). Deferring the open keeps module evaluation
 * pure, so the build - and operator mode, which needs no database at all -
 * stays clean. The handle is still cached on `globalThis` for hot-reload reuse.
 */
function getConnection(): DatabaseSync {
  return (globalForDb.__headtowerSqlite ??= openDatabase());
}

/**
 * The raw `DatabaseSync`, resolved on first access. A thin proxy preserves the
 * eager export's shape and type while keeping the open lazy: importing this
 * module opens nothing until a property is actually read.
 */
export const sqlite: DatabaseSync = new Proxy({} as DatabaseSync, {
  get(_target, prop, receiver) {
    const conn = getConnection();
    const value = Reflect.get(conn, prop, receiver);
    return typeof value === "function" ? value.bind(conn) : value;
  },
});

// Prepared-statement cache. `node:sqlite` is synchronous and JS is single
// threaded, so a statement reused across awaits always runs to completion
// before the next caller touches it.
const statementCache = new Map<string, StatementSync>();

function prepare(sqlText: string): StatementSync {
  let stmt = statementCache.get(sqlText);
  if (!stmt) {
    stmt = getConnection().prepare(sqlText);
    statementCache.set(sqlText, stmt);
  }
  return stmt;
}

/**
 * Bridge a single Drizzle query to `node:sqlite`. Reads return positional row
 * arrays (sqlite-proxy's expected shape); `get` with no match returns
 * `undefined` so Drizzle yields no row rather than an empty object.
 */
const remoteCallback: AsyncRemoteCallback = async (sqlText, params, method) => {
  const stmt = prepare(sqlText);

  if (method === "run") {
    stmt.run(...params);
    return { rows: [] };
  }

  stmt.setReturnArrays(true);

  if (method === "get") {
    const row = stmt.get(...params);
    // `row` is a value array or undefined; the cast keeps the proxy's typing.
    return { rows: row as unknown[] };
  }

  // "all" | "values": every row is already a positional value array.
  const rows = stmt.all(...params) as unknown[][];
  return { rows };
};

export const db = drizzle(remoteCallback, {
  schema: { auditLog, appUser, session, appSettings, snapshots },
});
