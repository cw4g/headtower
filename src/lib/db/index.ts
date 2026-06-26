/**
 * Headtower local database - public surface (server-only).
 *
 * Import the Drizzle instance and tables from here in Server Components, Route
 * Handlers, and Server Actions; never from client components.
 *
 *   import { db, auditLog } from "@/lib/db";
 *
 * Most callers should prefer the higher-level helpers in `@/lib/audit` over
 * hand-writing queries. See ./client for the connection core and ./schema for
 * the table definitions.
 */

export { db, sqlite } from "./client";

export {
  auditLog,
  appUser,
  session,
  SCHEMA_DDL,
  type AuditEntry,
  type NewAuditEntry,
  type AppUser,
  type NewAppUser,
  type SessionRecord,
  type NewSessionRecord,
  type AuditDetail,
} from "./schema";
