"use server";

/**
 * Command palette live data (server-only Server Actions).
 *
 * The palette's "Navigate" and "Settings" groups are a static, client-side
 * list, but "Devices" and "Recent activity" reflect live tailnet/audit state,
 * so they're fetched on demand instead of baked into the console shell.
 * `@/components/command-palette` calls both actions once when the palette
 * opens - never on every keystroke - and fuzzy-filters the results
 * client-side, exactly like the static commands.
 *
 * Both actions re-check the read capability server-side (the client-passed
 * `capabilities` prop only decides whether to bother calling at all) and fail
 * quiet: a denied session, an unreachable Headscale, or an unavailable local
 * store all resolve to an empty array rather than throwing. The palette is a
 * convenience overlay - a live section going dark must never take the static
 * nav down with it.
 */

import { nodes as nodesApi } from "@/lib/headscale";
import { withoutAgentNodes } from "@/lib/agent-node";
import { nodeDot, nowMs, relativeTime, toNodeView, type DotStatus } from "@/lib/machines";
import { listAudit } from "@/lib/audit";
import { sessionCan } from "@/lib/authz";

/** One device row for the palette's "Devices" group. */
export interface PaletteDevice {
  id: string;
  name: string;
  hostname: string;
  ipv4: string | null;
  tags: string[];
  status: DotStatus;
  statusLabel: string;
}

/**
 * The current tailnet's devices, projected to what the palette needs to
 * search and render. Gated on `machines.read`; the agent's own infrastructure
 * node is excluded, matching the Machines page.
 */
export async function listPaletteDevices(): Promise<PaletteDevice[]> {
  if (!(await sessionCan("machines.read"))) return [];
  try {
    const now = nowMs();
    const raw = await nodesApi.list();
    return withoutAgentNodes(raw).map((node) => {
      const view = toNodeView(node, now);
      const dot = nodeDot(view);
      return {
        id: view.id,
        name: view.name,
        hostname: view.hostname,
        ipv4: view.ipv4,
        tags: view.tags,
        status: dot.status,
        statusLabel: dot.label,
      };
    });
  } catch {
    // A flaky Headscale connection just means the palette skips the group.
    return [];
  }
}

/** Past-tense verb labels, mirroring `@/app/(app)/audit/format.ts`'s
 *  `humanizeAction` at a smaller scale - kept local so this server-only lib
 *  module doesn't reach into the audit route's presentation code. */
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

/** `"node.rename"` -> `"Renamed node"`; unrecognised shapes title-case as-is. */
function humanizeAction(action: string): string {
  const key = action.trim();
  if (!key) return "—";
  const parts = key.split(".");
  if (parts.length < 2) return VERB_LABELS[key] ?? titleCase(key);
  const verb = parts[parts.length - 1];
  const subject = parts.slice(0, -1).join(" ").replace(/_/g, " ");
  return `${VERB_LABELS[verb] ?? titleCase(verb)} ${subject}`.trim();
}

function titleCase(token: string): string {
  return token
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** One entry for the palette's "Recent activity" group. */
export interface PaletteActivityEntry {
  id: number;
  actor: string;
  actionLabel: string;
  targetLabel: string | null;
  relativeTime: string;
}

/** The palette shows a glance, not the full trail - the Audit page has that. */
const RECENT_ACTIVITY_LIMIT = 5;

/**
 * The most recent audit entries, pre-formatted the same way the Audit page
 * renders them. Gated on `audit.read`.
 */
export async function listPaletteActivity(): Promise<PaletteActivityEntry[]> {
  if (!(await sessionCan("audit.read"))) return [];
  try {
    const { entries } = await listAudit({ limit: RECENT_ACTIVITY_LIMIT });
    const now = nowMs();
    return entries.map((entry) => {
      const ts = entry.ts instanceof Date ? entry.ts : new Date(entry.ts);
      return {
        id: entry.id,
        actor: entry.actor,
        actionLabel: humanizeAction(entry.action),
        targetLabel: entry.targetName?.trim() || entry.targetId || null,
        relativeTime: relativeTime(ts.toISOString(), now),
      };
    });
  } catch {
    return [];
  }
}
