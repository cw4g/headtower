/**
 * Machine (node) presentation helpers.
 *
 * Pure, isomorphic logic shared by the server pages and the client table leaf:
 * derive status, normalise tags across the 0.26 - 0.29 schema split, classify
 * routes, and format timestamps deterministically (UTC, no locale) so a value
 * rendered on the server hydrates identically on the client.
 *
 * No server-only imports here — this module is safe to pull into a
 * `"use client"` component.
 */

import type { Node } from "@/lib/headscale";

/** The two default routes that mark a node as an exit node. */
export const DEFAULT_ROUTES = ["0.0.0.0/0", "::/0"] as const;

/** Status-dot kinds, matching the StatusDot primitive. */
export type DotStatus = "online" | "warn" | "critical" | "idle";

/**
 * Device facts contributed by the optional agent sidecar. Kept as a small,
 * serialisable projection (structurally a subset of `AgentPeer`) so it can be
 * merged into a `NodeView` and rendered in the client table. Absent when no
 * agent is configured or no peer matched the node.
 */
export interface NodeAgentInfo {
  os: string | null;
  clientVersion: string | null;
  endpoints: string[];
}

/** A serialisable projection of a Node for rendering in client + server views. */
export interface NodeView {
  id: string;
  /** Operator-facing display name. */
  name: string;
  /** The node's own reported hostname. */
  hostname: string;
  user: {
    name: string;
    displayName: string;
    email: string;
  };
  ipv4: string | null;
  ipv6: string | null;
  addresses: string[];
  /** Effective ACL tags currently applied. */
  tags: string[];
  /** Tags the node requested that policy rejected (0.26 - 0.28 only). */
  invalidTags: string[];
  online: boolean;
  expired: boolean;
  /** Key expires within the warning window but has not yet expired. */
  expiresSoon: boolean;
  registerMethod: string;
  createdAt: string;
  lastSeen: string | null;
  expiry: string | null;
  /** Pre-rendered relative last-seen label (e.g. "4m ago", "never"). */
  lastSeenLabel: string;
  /** Serving the default route (active exit node). */
  isExitNode: boolean;
  /** Advertising the default route but not yet approved for it. */
  advertisesExit: boolean;
  /** Approved + advertised subnet routes, excluding the default route. */
  subnetRoutes: string[];
  /** Routes advertised by the node but not yet approved. */
  pendingRoutes: string[];
  /** Agent-sourced device facts (OS, client version, endpoints), or null. */
  agent: NodeAgentInfo | null;
}

/**
 * Request-time clock. Wrapped here (rather than calling `Date.now()` inline in a
 * Server Component) so the value is read once per request without tripping the
 * render-purity lint, which can't tell a server render from a client one.
 */
export function nowMs(): number {
  return Date.now();
}

/** Key expiries inside this window are flagged as "expiring soon". */
const EXPIRY_WARN_MS = 14 * 24 * 60 * 60 * 1000;

const REGISTER_METHOD_LABELS: Record<string, string> = {
  REGISTER_METHOD_AUTH_KEY: "Auth key",
  REGISTER_METHOD_CLI: "CLI",
  REGISTER_METHOD_OIDC: "OIDC",
  REGISTER_METHOD_UNSPECIFIED: "Unspecified",
};

export function registerMethodLabel(method: string): string {
  return REGISTER_METHOD_LABELS[method] ?? "Unknown";
}

/**
 * Effective tags for a node across the schema split: 0.29 collapses everything
 * into `tags`; 0.26 - 0.28 spread valid + forced tags across two fields.
 */
export function nodeTags(node: Node): string[] {
  if (node.tags && node.tags.length > 0) return dedupe(node.tags);
  return dedupe([...(node.validTags ?? []), ...(node.forcedTags ?? [])]);
}

/** Tags the node asked for that policy did not permit (legacy schema only). */
export function nodeInvalidTags(node: Node): string[] {
  return dedupe(node.invalidTags ?? []);
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function isDefaultRoute(route: string): boolean {
  return (DEFAULT_ROUTES as readonly string[]).includes(route);
}

/** Split a node's addresses into the first IPv4 and IPv6 it holds. */
export function splitAddresses(addresses: string[]): {
  ipv4: string | null;
  ipv6: string | null;
} {
  let ipv4: string | null = null;
  let ipv6: string | null = null;
  for (const addr of addresses) {
    if (addr.includes(":")) ipv6 ??= addr;
    else ipv4 ??= addr;
  }
  return { ipv4, ipv6 };
}

/**
 * Compact, deterministic relative time ("4m ago", "in 3d", "never"). Computed
 * from an explicit `nowMs` so the same value renders identically server-side and
 * after hydration.
 */
export function relativeTime(iso: string | null, nowMs: number): string {
  if (!iso) return "never";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";

  const diffMs = nowMs - t;
  const future = diffMs < 0;
  const seconds = Math.floor(Math.abs(diffMs) / 1000);
  const tail = future ? "from now" : "ago";

  if (seconds < 10) return "just now";
  const stamp = (value: number, unit: string) =>
    future ? `in ${value}${unit}` : `${value}${unit} ${tail}`;

  if (seconds < 60) return stamp(seconds, "s");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return stamp(minutes, "m");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return stamp(hours, "h");
  const days = Math.floor(hours / 24);
  if (days < 30) return stamp(days, "d");
  const months = Math.floor(days / 30);
  if (months < 12) return stamp(months, "mo");
  return stamp(Math.floor(days / 365), "y");
}

/** Deterministic absolute timestamp in UTC, e.g. "2025-01-02 15:04 UTC". */
export function formatUtc(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`
  );
}

/**
 * Project a raw Node into the serialisable view model used by the UI. Pass the
 * matched agent peer (already looked up) to fold in OS / client version /
 * endpoints; omit it to render the node with no agent enrichment.
 */
export function toNodeView(
  node: Node,
  nowMs: number,
  agent: NodeAgentInfo | null = null,
): NodeView {
  const { ipv4, ipv6 } = splitAddresses(node.ipAddresses ?? []);

  const expiryMs = node.expiry ? Date.parse(node.expiry) : NaN;
  const hasExpiry = !Number.isNaN(expiryMs);
  const expired = hasExpiry && expiryMs <= nowMs;
  const expiresSoon =
    hasExpiry && !expired && expiryMs - nowMs <= EXPIRY_WARN_MS;

  const approved = node.approvedRoutes ?? [];
  const available = node.availableRoutes ?? [];
  const subnet = node.subnetRoutes ?? [];

  const isExitNode = subnet.some(isDefaultRoute);
  const advertisesExit = !isExitNode && available.some(isDefaultRoute);
  const subnetRoutes = subnet.filter((r) => !isDefaultRoute(r)).sort();
  const pendingRoutes = available
    .filter((r) => !approved.includes(r) && !isDefaultRoute(r))
    .sort();

  return {
    id: node.id,
    name: node.givenName || node.name,
    hostname: node.name,
    user: {
      name: node.user?.name ?? "",
      displayName: node.user?.displayName ?? "",
      email: node.user?.email ?? "",
    },
    ipv4,
    ipv6,
    addresses: node.ipAddresses ?? [],
    tags: nodeTags(node),
    invalidTags: nodeInvalidTags(node),
    online: node.online,
    expired,
    expiresSoon,
    registerMethod: registerMethodLabel(node.registerMethod),
    createdAt: node.createdAt,
    lastSeen: node.lastSeen,
    expiry: node.expiry,
    lastSeenLabel: node.online ? "connected" : relativeTime(node.lastSeen, nowMs),
    isExitNode,
    advertisesExit,
    subnetRoutes,
    pendingRoutes,
    agent: agent
      ? {
          os: agent.os,
          clientVersion: agent.clientVersion,
          endpoints: agent.endpoints,
        }
      : null,
  };
}

/** The status-dot kind + label for a node's primary connectivity state. */
export function nodeDot(view: Pick<NodeView, "online" | "expired">): {
  status: DotStatus;
  label: string;
} {
  if (view.expired) return { status: "critical", label: "Expired" };
  return view.online
    ? { status: "online", label: "Online" }
    : { status: "idle", label: "Offline" };
}

/** Best display label for a node's owner. */
export function ownerLabel(user: NodeView["user"]): string {
  return user.displayName || user.name || user.email || "—";
}

/* ------------------------------------------------------------------ *
 * View mode - Table | Cards, a sticky display preference (cookie).
 * ------------------------------------------------------------------ */

/** The two machine list presentations. */
export type MachineViewMode = "table" | "cards";

/** Cookie carrying the operator's machines-view preference. */
export const MACHINES_VIEW_COOKIE = "ht_machines_view";

/** Persist the preference for a year; a non-secret UI cookie. */
export const MACHINES_VIEW_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Narrow an untrusted cookie value to a view mode (table is the default). */
export function normalizeMachineView(
  value: string | null | undefined,
): MachineViewMode {
  return value === "cards" ? "cards" : "table";
}

/* ------------------------------------------------------------------ *
 * Filtering - shared verbatim by the table and card views so both read
 * the same query grammar and status segments.
 * ------------------------------------------------------------------ */

/** The status segments offered on the machines toolbar. */
export type StatusFilter = "all" | "online" | "offline" | "issues";

/** Segment definitions (id + label), in display order. */
export const MACHINE_STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "online", label: "Online" },
  { id: "offline", label: "Offline" },
  { id: "issues", label: "Needs attention" },
];

/** A node the operator likely needs to act on (expiry, rejected tags, pending). */
export function hasIssue(node: NodeView): boolean {
  return (
    node.expired ||
    node.expiresSoon ||
    node.invalidTags.length > 0 ||
    node.advertisesExit ||
    node.pendingRoutes.length > 0
  );
}

/** Free-text match across a node's names, owner, addresses and tags. */
export function matchesQuery(node: NodeView, q: string): boolean {
  if (!q) return true;
  const haystack = [
    node.name,
    node.hostname,
    node.user.name,
    node.user.displayName,
    node.user.email,
    node.registerMethod,
    ...node.addresses,
    ...node.tags,
  ]
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

/** Status-segment match (online / offline / needs-attention). */
export function matchesStatus(node: NodeView, filter: StatusFilter): boolean {
  switch (filter) {
    case "online":
      return node.online && !node.expired;
    case "offline":
      return !node.online && !node.expired;
    case "issues":
      return hasIssue(node);
    default:
      return true;
  }
}

/* ------------------------------------------------------------------ *
 * Reachability sparkline - a derived hint, not real history.
 *
 * The control plane records only a single `lastSeen` instant, so there is no
 * true time-series to plot. We synthesise a short, deterministic "recent
 * reachability" trend from the facts we do hold - online state and the age of
 * the last contact - bucketed across a fixed recent window. A live node reads as
 * a steady strong signal; a node last seen partway through the window shows the
 * signal falling away at that point; a node dark for the whole window (or never
 * seen) yields an empty series so the card omits the sparkline.
 *
 * Determinism matters: identical inputs must render the same on the server and
 * after hydration, so the subtle per-node ripple is seeded from the node id and
 * the clock is passed in rather than read inline. Callers should plot it against
 * a fixed [0, 1] domain (`min={0} max={1}`) so the ripple stays calm instead of
 * being stretched to fill the height.
 * ------------------------------------------------------------------ */

/** Points in the reachability series. */
const REACH_BUCKETS = 24;
/** Span of one bucket; 24 x 1h => a rolling 24-hour window. */
const REACH_BUCKET_MS = 60 * 60 * 1000;

/** Keep a value inside the plotted band (a touch above 0 so the floor reads). */
function clampReach(v: number): number {
  return v < 0.04 ? 0.04 : v > 1 ? 1 : v;
}

/** FNV-1a string hash -> 32-bit unsigned seed. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 PRNG - tiny, deterministic, ample for cosmetic jitter. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Recent-reachability series (oldest -> newest), or an empty array when there is
 * nothing recent to hint. Pass the request clock so the server render and the
 * client hydration agree on the drop-off position.
 */
export function reachabilitySeries(
  node: Pick<NodeView, "id" | "online" | "expired" | "lastSeen">,
  nowMs: number,
): number[] {
  const rand = mulberry32(hashString(node.id));
  const jitter = (level: number, spread: number) =>
    clampReach(level + (rand() - 0.5) * spread);

  // A live node reads as a steady strong signal across the whole window.
  if (node.online && !node.expired) {
    return Array.from({ length: REACH_BUCKETS }, () => jitter(0.9, 0.12));
  }

  const seen = node.lastSeen ? Date.parse(node.lastSeen) : NaN;
  if (Number.isNaN(seen)) return []; // never seen -> nothing to plot

  const windowStart = nowMs - REACH_BUCKETS * REACH_BUCKET_MS;
  if (seen <= windowStart) return []; // dark for the whole window -> omit

  // Reachable up to the bucket holding lastSeen, then the signal drops away.
  const dropAt = Math.round((seen - windowStart) / REACH_BUCKET_MS);
  return Array.from({ length: REACH_BUCKETS }, (_, i) =>
    i <= dropAt ? jitter(0.82, 0.12) : jitter(0.08, 0.05),
  );
}
