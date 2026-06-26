/**
 * Headtower local database schema (server-only).
 *
 * Headscale stays the source of truth for tailnet data; this database holds
 * ONLY Headtower's own state. Three tables:
 *
 *   audit_log  append-only operator action trail (one row per mutation)
 *   app_user   Headtower accounts (OIDC `sub` -> role), distinct from tailnet users
 *   session    server-side login sessions referencing app_user
 *
 * The Drizzle table definitions below are the typed query surface; {@link SCHEMA_DDL}
 * is the matching idempotent DDL the client runs on first import to create the
 * tables. Keep the two in lock-step when changing columns.
 *
 * Exposed surface:
 *   tables   auditLog, appUser, session
 *   types    AuditEntry / NewAuditEntry, AppUser / NewAppUser,
 *            SessionRecord / NewSessionRecord, AuditDetail
 *   ddl      SCHEMA_DDL
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
// Type-only: erased at build, so importing rbac here adds no runtime coupling
// (and does not trip rbac's server-only import guard).
import type { Role } from "@/lib/rbac";

/** Free-form structured context attached to an audit entry (stored as JSON). */
export type AuditDetail = Record<string, unknown>;

/**
 * Append-only audit trail. One row per operator-initiated change, written via
 * `recordAudit` in `@/lib/audit`. Never updated or deleted in normal operation.
 */
export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** When the action happened (epoch ms on disk, `Date` in TypeScript). */
  ts: integer("ts", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  /** Who acted: an `app_user` id, or "operator" in single-operator mode. */
  actor: text("actor").notNull(),
  /** Verb-like action key, e.g. "node.rename" or "user.create". */
  action: text("action").notNull(),
  /** Kind of thing acted on, e.g. "node" | "user" | "policy". */
  targetType: text("target_type"),
  /** Stable id of the target (Headscale ids are strings). */
  targetId: text("target_id"),
  /** Human label of the target at action time, for legible history. */
  targetName: text("target_name"),
  /** Structured before/after or parameters, serialised as JSON. */
  detail: text("detail", { mode: "json" }).$type<AuditDetail>(),
  /** Originating client IP, when known. */
  ip: text("ip"),
});

/**
 * A Headtower account. Identified by the OIDC subject (`sub`); `role` drives
 * RBAC (see `@/lib/rbac`). Separate from tailnet users, which live in Headscale.
 */
export const appUser = sqliteTable("app_user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  /** OIDC subject identifier; the stable external identity key. */
  sub: text("sub").notNull().unique(),
  name: text("name").notNull(),
  email: text("email"),
  picture: text("picture"),
  /** RBAC role; new accounts default to the operator role. */
  role: text("role").$type<Role>().notNull().default("operator"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
});

/** A server-side login session. Cascade-deleted with its owning account. */
export const session = sqliteTable("session", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => appUser.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

export type AuditEntry = typeof auditLog.$inferSelect;
export type NewAuditEntry = typeof auditLog.$inferInsert;
export type AppUser = typeof appUser.$inferSelect;
export type NewAppUser = typeof appUser.$inferInsert;
export type SessionRecord = typeof session.$inferSelect;
export type NewSessionRecord = typeof session.$inferInsert;

/**
 * Idempotent DDL run once per process on import (see ./client). Mirrors the
 * Drizzle tables above; `timestamp_ms` columns are plain INTEGER on disk.
 */
export const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  target_name TEXT,
  detail TEXT,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_log_ts ON audit_log (ts);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log (actor);
CREATE INDEX IF NOT EXISTS idx_audit_log_target_type ON audit_log (target_type);

CREATE TABLE IF NOT EXISTS app_user (
  id TEXT PRIMARY KEY,
  sub TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  picture TEXT,
  role TEXT NOT NULL DEFAULT 'operator',
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_user_id ON session (user_id);
CREATE INDEX IF NOT EXISTS idx_session_expires_at ON session (expires_at);
`;
