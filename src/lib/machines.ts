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

/** Project a raw Node into the serialisable view model used by the UI. */
export function toNodeView(node: Node, nowMs: number): NodeView {
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
