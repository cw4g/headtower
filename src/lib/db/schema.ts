/**
 * Headtower local database schema (server-only).
 *
 * Headscale stays the source of truth for tailnet data; this database holds
 * ONLY Headtower's own state. Eight tables:
 *
 *   audit_log         append-only operator action trail (one row per mutation)
 *   app_user          Headtower accounts (OIDC `sub` -> role), distinct from tailnet users
 *   session           server-side login sessions referencing app_user
 *   app_settings      key/value store for the in-app configuration (see @/lib/config):
 *                     the Headscale connection + the legacy single OIDC provider,
 *                     editable at runtime and overriding the env bootstrap. Secret
 *                     values are stored encoded.
 *   oidc_provider     additional OIDC identity providers beyond the legacy one above
 *                     (see @/lib/auth/oidc-providers) - any number can be enabled
 *                     at once, each rendered as its own button on the login page.
 *   personal_api_key  a self-issued token an account mints for itself (see
 *                     @/app/(app)/account) - distinct from Headscale's own
 *                     control-plane API keys. Only a hash is stored.
 *   snapshot          throttled time-series of tailnet size (total / online / users),
 *                     recorded on dashboard load to chart coverage over time
 *   ssh_session       metadata for browser SSH terminal connections - who, which
 *                     device, which SSH user, when a token was minted (see
 *                     @/lib/ssh-sessions). Start-only, by design: see that table's
 *                     doc comment below for why no end time is recorded.
 *
 * The Drizzle table definitions below are the typed query surface; {@link SCHEMA_DDL}
 * is the matching idempotent DDL the client runs on first import to create the
 * tables. Keep the two in lock-step when changing columns.
 *
 * Exposed surface:
 *   tables   auditLog, appUser, session, appSettings, oidcProvider, personalApiKey,
 *            snapshots, sshSession
 *   types    AuditEntry / NewAuditEntry, AppUser / NewAppUser,
 *            SessionRecord / NewSessionRecord, AppSetting / NewAppSetting,
 *            OidcProviderRow / NewOidcProviderRow, PersonalApiKeyRow / NewPersonalApiKeyRow,
 *            Snapshot / NewSnapshot, SshSession / NewSshSession, AuditDetail
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
 * Session metadata for the browser-based SSH terminal (see
 * `@/components/terminal/ssh-terminal`, written via `recordSshSession` in
 * `@/lib/ssh-sessions`). One row per minted `/ssh` access token - the closest
 * observable proxy this app has for "a session started", since the shell
 * itself runs in the Headtower agent's SSH bridge (`agent/ssh.go`), not here.
 * There is no reliable signal back to this process for when that shell exits
 * (the browser tab can close, crash, or lose the network before any "closed"
 * event fires), so this is deliberately start-only: no end time or duration
 * column, rather than persisting a guess this app can't actually observe.
 */
export const sshSession = sqliteTable("ssh_session", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** When the token was minted (epoch ms on disk, `Date` in TypeScript). */
  startedAt: integer("started_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  /** Who connected: an `app_user` id, or "operator" in single-operator mode. */
  actor: text("actor").notNull(),
  /** Headscale node id, when known. `mintSshToken` is only ever given a
   *  hostname or tailnet IP to dial, not the node id, so this is null today -
   *  reserved for when that plumbing exists rather than faked from `deviceName`. */
  deviceId: text("device_id"),
  /** Hostname or tailnet IP the terminal dialed - the best identifier for
   *  "which device" available at the point a token is minted. */
  deviceName: text("device_name").notNull(),
  /** SSH user presented to the target. */
  sshUser: text("ssh_user").notNull(),
});

/**
 * An additional OIDC identity provider, beyond the single legacy provider
 * configured via `app_settings` (`oidc.issuer` / `oidc.client_id` /
 * `oidc.client_secret`, still supported unchanged for backward compatibility).
 * The login page renders one button per enabled row here, plus the legacy
 * provider when it is configured - any number of providers can be live at
 * once. `clientSecret` is stored encoded, same scheme as other secrets (see
 * `@/lib/config`'s `encodeSecret`/`decodeSecret`).
 */
export const oidcProvider = sqliteTable("oidc_provider", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  /** Shown on the login button, e.g. "Google" -> "Continue with Google". */
  name: text("name").notNull(),
  issuer: text("issuer").notNull(),
  clientId: text("client_id").notNull(),
  clientSecret: text("client_secret").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  /** Login-page display order, ascending. */
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
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

/**
 * A self-issued Headtower token: an account mints one for itself to script
 * against its own data. Distinct from `apiKeys` in `@/lib/headscale`, which
 * are Headscale's own control-plane bearer tokens - this is a Headtower-local
 * concept with no bearing on the tailnet. Only `tokenHash` (a SHA-256 digest)
 * is stored; the raw token is shown once, at creation, and never again (see
 * `@/app/(app)/account`). Cascade-deleted with its owning account, so it is
 * OIDC-only - single-operator (API-key) mode has no `app_user` row to own one.
 */
export const personalApiKey = sqliteTable("personal_api_key", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => appUser.id, { onDelete: "cascade" }),
  /** Operator-chosen label, e.g. "laptop CI script". */
  name: text("name").notNull(),
  /** SHA-256 hex digest of the token; the raw value is never persisted. */
  tokenHash: text("token_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  /** Null means the key never expires. */
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  /** Null means it has never been used to authenticate a request. */
  lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
});

/**
 * In-app configuration store: one row per setting `key` (e.g. `headscale.url`).
 * Read and written through `@/lib/config`, which layers these over the env
 * bootstrap so the whole connection can be set from the UI. Secret values (the
 * Headscale API key, the OIDC client secret) are stored with an encoding prefix
 * (see `@/lib/config`); everything else is stored verbatim.
 */
export const appSettings = sqliteTable("app_settings", {
  /** Namespaced setting key, e.g. "headscale.url" or "oidc.issuer". */
  key: text("key").primaryKey(),
  /** Raw stored value (secrets are already encoded by the config layer). */
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * A tailnet size sample. One row is appended on dashboard load, throttled to at
 * most one every few minutes (see `@/lib/db/snapshots`), giving a lightweight
 * history to chart coverage over time. No foreign keys: it is standalone
 * telemetry about Headscale, not about any Headtower account.
 */
export const snapshots = sqliteTable("snapshot", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** When the sample was taken (epoch ms on disk, `Date` in TypeScript). */
  ts: integer("ts", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  /** Total devices enrolled at sample time. */
  total: integer("total").notNull(),
  /** Devices online at sample time. */
  online: integer("online").notNull(),
  /** Tailnet users at sample time. */
  users: integer("users").notNull(),
});

export type AuditEntry = typeof auditLog.$inferSelect;
export type NewAuditEntry = typeof auditLog.$inferInsert;
export type AppUser = typeof appUser.$inferSelect;
export type NewAppUser = typeof appUser.$inferInsert;
export type SessionRecord = typeof session.$inferSelect;
export type NewSessionRecord = typeof session.$inferInsert;
export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;
export type OidcProviderRow = typeof oidcProvider.$inferSelect;
export type NewOidcProviderRow = typeof oidcProvider.$inferInsert;
export type PersonalApiKeyRow = typeof personalApiKey.$inferSelect;
export type NewPersonalApiKeyRow = typeof personalApiKey.$inferInsert;
export type Snapshot = typeof snapshots.$inferSelect;
export type NewSnapshot = typeof snapshots.$inferInsert;
export type SshSession = typeof sshSession.$inferSelect;
export type NewSshSession = typeof sshSession.$inferInsert;

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

CREATE TABLE IF NOT EXISTS ssh_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  actor TEXT NOT NULL,
  device_id TEXT,
  device_name TEXT NOT NULL,
  ssh_user TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ssh_session_started_at ON ssh_session (started_at);
CREATE INDEX IF NOT EXISTS idx_ssh_session_actor ON ssh_session (actor);
CREATE INDEX IF NOT EXISTS idx_ssh_session_device_name ON ssh_session (device_name);

CREATE TABLE IF NOT EXISTS oidc_provider (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  issuer TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oidc_provider_sort_order ON oidc_provider (sort_order);

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

CREATE TABLE IF NOT EXISTS personal_api_key (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  last_used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_personal_api_key_user_id ON personal_api_key (user_id);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  total INTEGER NOT NULL,
  online INTEGER NOT NULL,
  users INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshot_ts ON snapshot (ts);
`;
