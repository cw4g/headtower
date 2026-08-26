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
  readSetting,
  readAllSettings,
  writeSetting,
  deleteSetting,
} from "./settings";

export {
  recordSnapshot,
  recordSnapshotThrottled,
  latestSnapshot,
  listSnapshots,
} from "./snapshots";

export {
  getNodeMetadata,
  getNodeMetadataMap,
  upsertNodeMetadata,
  deleteNodeMetadata,
  deleteNodeMetadataMany,
  type NodeMetadataInput,
} from "./node-metadata";

export {
  digestOf,
  listRevisions,
  getRevision,
  findByDigest,
  rememberRevision,
  markDeployed,
  updateNote as updateRevisionNote,
  deleteRevision,
  type RememberResult,
} from "./policy-revisions";

export {
  NOTE_MAX_LENGTH as REVISION_NOTE_MAX_LENGTH,
  normalizeNote as normalizeRevisionNote,
  revisionState,
  stateMeta as revisionStateMeta,
  type PolicyRevisionState,
  type PolicyRevisionView,
} from "./policy-revision-types";

export {
  ENVIRONMENTS,
  NOTE_MAX_LENGTH,
  LABEL_MAX_COUNT,
  LABEL_MAX_LENGTH,
  EMPTY_NODE_METADATA,
  hasMetadata,
  environmentMeta,
  normalizeEnvironment,
  normalizeNote,
  normalizeLabels,
  labelColor,
  type NodeEnvironment,
  type EnvironmentMeta,
  type NodeMetadataValue,
} from "./node-metadata-types";

export {
  auditLog,
  appUser,
  session,
  appSettings,
  snapshots,
  nodeMetadata,
  policyRevision,
  SCHEMA_DDL,
  type AuditEntry,
  type NewAuditEntry,
  type AppUser,
  type NewAppUser,
  type SessionRecord,
  type NewSessionRecord,
  type AppSetting,
  type NewAppSetting,
  type Snapshot,
  type NewSnapshot,
  type NodeMetadataRow,
  type NewNodeMetadataRow,
  type PolicyRevisionRow,
  type NewPolicyRevisionRow,
  type AuditDetail,
} from "./schema";
