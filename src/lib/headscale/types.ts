/**
 * Headscale entity shapes.
 *
 * These mirror the JSON that Headscale's gRPC-gateway emits for the `/api/v1`
 * admin surface (Headscale 0.26 - 0.29). Naming and encoding follow the gateway
 * defaults, so when reading these types keep in mind:
 *
 *   - JSON keys are camelCase (e.g. `machineKey`, `givenName`, `preAuthKey`).
 *   - `uint64` ids are serialised as decimal *strings*, never numbers. We model
 *     them as `HeadscaleId` (string) to avoid silent precision loss.
 *   - Timestamps are RFC 3339 strings (e.g. "2025-01-02T15:04:05Z"). A field
 *     backed by an unset timestamp/message comes back as `null`.
 *   - Enums are serialised as their proto name string (e.g.
 *     "REGISTER_METHOD_AUTH_KEY"), not as numbers.
 *
 * Source of truth: juanfont/headscale `proto/headscale/v1/*.proto`.
 */

/** RFC 3339 timestamp string, e.g. "2025-01-02T15:04:05Z". */
export type Timestamp = string;

/** A `uint64` id, JSON-encoded by the gateway as a decimal string. */
export type HeadscaleId = string;

/** How a node was registered with the control plane. */
export type RegisterMethod =
  | "REGISTER_METHOD_UNSPECIFIED"
  | "REGISTER_METHOD_AUTH_KEY"
  | "REGISTER_METHOD_CLI"
  | "REGISTER_METHOD_OIDC";

/** A tailnet user / namespace. (`user.proto`) */
export interface User {
  id: HeadscaleId;
  name: string;
  createdAt: Timestamp;
  displayName: string;
  email: string;
  providerId: string;
  provider: string;
  profilePicUrl: string;
}

/** A pre-authentication key used to enrol nodes non-interactively. (`preauthkey.proto`) */
export interface PreAuthKey {
  /** Owning user. (0.23+ returns the full user object, not a bare username.) */
  user: User;
  id: HeadscaleId;
  /** The secret key value. Only fully returned at creation time. */
  key: string;
  reusable: boolean;
  ephemeral: boolean;
  used: boolean;
  /** Null when the key never expires. */
  expiration: Timestamp | null;
  createdAt: Timestamp;
  /** ACL tags automatically applied to nodes enrolled with this key. */
  aclTags: string[];
}

/** A machine (device) in the tailnet. (`node.proto`) */
export interface Node {
  id: HeadscaleId;
  machineKey: string;
  nodeKey: string;
  discoKey: string;
  ipAddresses: string[];
  name: string;
  user: User;
  /** Null if the node has never been seen online. */
  lastSeen: Timestamp | null;
  /** Null when the node key has no expiry. */
  expiry: Timestamp | null;
  /** Null unless the node was enrolled with a pre-auth key. */
  preAuthKey: PreAuthKey | null;
  createdAt: Timestamp;
  registerMethod: RegisterMethod;

  // --- Tags -----------------------------------------------------------------
  // Headscale 0.26 - 0.28 split a node's tags across three fields. Headscale
  // 0.29 collapsed them into a single `tags` field and dropped the others.
  // We keep every field optional so one `Node` type works across the range.
  /** 0.26 - 0.28: tags set explicitly via `headscale nodes tag`. */
  forcedTags?: string[];
  /** 0.26 - 0.28: tags requested by the node but not permitted by policy. */
  invalidTags?: string[];
  /** 0.26 - 0.28: tags permitted by policy and currently in effect. */
  validTags?: string[];
  /** 0.29+: the node's effective tags (replaces the three fields above). */
  tags?: string[];

  givenName: string;
  online: boolean;
  /** Routes an operator has approved this node to serve. */
  approvedRoutes: string[];
  /** Routes the node is advertising. */
  availableRoutes: string[];
  /** Routes currently being served (advertised and approved). */
  subnetRoutes: string[];
}

/** A long-lived API key for the Headscale admin API. (`apikey.proto`) */
export interface ApiKey {
  id: HeadscaleId;
  /** Short, non-secret prefix used to reference the key. */
  prefix: string;
  expiration: Timestamp | null;
  createdAt: Timestamp;
  /** Null if the key has never been used. */
  lastSeen: Timestamp | null;
}

/** The active ACL/HuJSON policy document. (`policy.proto`) */
export interface Policy {
  /** The raw HuJSON policy document. */
  policy: string;
  /** When the policy was last updated; null if never set. */
  updatedAt: Timestamp | null;
}

// --- Gateway response envelopes --------------------------------------------
// Every list/get RPC wraps its payload in a single-key object. These are used
// internally by the resource modules to unwrap responses.

export interface ListNodesResponse {
  nodes: Node[];
}
export interface NodeResponse {
  node: Node;
}
export interface ListUsersResponse {
  users: User[];
}
export interface UserResponse {
  user: User;
}
export interface ListPreAuthKeysResponse {
  preAuthKeys: PreAuthKey[];
}
export interface PreAuthKeyResponse {
  preAuthKey: PreAuthKey;
}
export interface ListApiKeysResponse {
  apiKeys: ApiKey[];
}
export interface CreateApiKeyResponse {
  /** The full secret key, returned exactly once at creation. */
  apiKey: string;
}
