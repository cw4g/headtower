/**
 * Audit view formatting helpers — pure, no server-only or client-only imports,
 * so the Server Component (page), the client filter leaf, and the CSV route
 * handler can all share them without dragging `@/lib/db` into the browser.
 *
 *   humanizeAction("node.rename")  -> "Renamed node"
 *   relativeTime(date)             -> "3m ago"
 *   summarizeDetail({ from, to })  -> "from=a · to=b"
 *   targetHref("node", "12")       -> "/machines/12"
 */

import type { AuditDetail } from "@/lib/db";

/** Past-tense labels for the verb half of an `area.verb` action key. */
const VERB_LABELS: Record<string, string> = {
  create: "Created",
  add: "Added",
  delete: "Deleted",
  remove: "Removed",
  rename: "Renamed",
  update: "Updated",
  edit: "Edited",
  expire: "Expired",
  approve: "Approved",
  revoke: "Revoked",
  enable: "Enabled",
  disable: "Disabled",
  move: "Moved",
  tag: "Tagged",
  rotate: "Rotated",
  login: "Signed in",
  logout: "Signed out",
  register: "Registered",
  accept: "Accepted",
  reject: "Rejected",
  connect: "Connected",
};

/**
 * Turn a machine action key into a legible label. Keys are conventionally
 * `area.verb` (e.g. "node.rename"); we render the verb in past tense followed
 * by the subject ("Renamed node"). Unknown shapes fall back to a tidy
 * Title-cased rendering so nothing ever shows raw snake/dot case to operators.
 */
export function humanizeAction(action: string): string {
  const key = action.trim();
  if (!key) return "—";

  const parts = key.split(".");
  if (parts.length >= 2) {
    const verb = parts[parts.length - 1];
    const subject = parts.slice(0, -1).join(" ").replace(/_/g, " ");
    const verbLabel = VERB_LABELS[verb] ?? titleCase(verb);
    return `${verbLabel} ${subject}`.trim();
  }

  return VERB_LABELS[key] ?? titleCase(key);
}

/** Title-case a single token, splitting on `_` and `-`. */
function titleCase(token: string): string {
  return token
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * A compact relative-time label ("just now", "5m ago", "3d ago"). Entries older
 * than four weeks fall back to an absolute UTC date so the readout stays exact.
 * Computed at request time (the page is dynamic), so it never hydrates client-side.
 */
export function relativeTime(date: Date, now: number = Date.now()): string {
  const diff = now - date.getTime();
  if (!Number.isFinite(diff)) return "—";
  if (diff < 0) return "just now";
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d ago`;
  if (diff < 4 * WEEK) return `${Math.floor(diff / WEEK)}w ago`;
  return date.toISOString().slice(0, 10);
}

/** Full ISO timestamp for tooltips / titles, defensively coercing the value. */
export function isoTimestamp(value: Date | number | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

/**
 * Collapse a structured detail object into a one-line `key=value` summary.
 * Nested values are JSON-encoded; returns null when there is nothing to show.
 */
export function summarizeDetail(detail: AuditDetail | null | undefined): string | null {
  if (!detail || typeof detail !== "object") return null;
  const entries = Object.entries(detail);
  if (entries.length === 0) return null;
  return entries.map(([key, value]) => `${key}=${formatValue(value)}`).join(" · ");
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Where a target links to, when the console has a view for it. Nodes link to
 * their machine detail; users link to the directory. Everything else is plain.
 */
export function targetHref(
  targetType: string | null | undefined,
  targetId: string | null | undefined,
): string | null {
  switch (targetType) {
    case "node":
    case "machine":
      return targetId ? `/machines/${encodeURIComponent(targetId)}` : null;
    case "user":
      return "/users";
    default:
      return null;
  }
}
