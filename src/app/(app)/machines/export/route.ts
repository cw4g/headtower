/**
 * Machine inventory CSV export (Route Handler).
 *
 * Streams the full tailnet inventory - identity, owner, addresses, ACL tags,
 * routes, connectivity, agent-reported OS / client version, and the
 * Headtower-local environment + labels - as a downloadable `text/csv`
 * attachment.
 *
 *   GET /machines/export
 *
 * Modelled on the audit trail export (`../../audit/export/route`): the same
 * `requireSession` gate, and the same RFC 4180 quoting + spreadsheet
 * formula-injection guard on every cell. Server-only by importing
 * `@/lib/headscale` and `@/lib/db` (which reach the control plane / `node:sqlite`).
 */

import { requireSession, UnauthorizedError } from "@/lib/auth";
import { nodes as nodesApi } from "@/lib/headscale";
import { getAgentPeers } from "@/lib/agent";
import { withoutAgentNodes } from "@/lib/agent-node";
import { getNodeMetadataMap } from "@/lib/db";
import {
  agentOsLabel,
  ownerLabel,
  toNodeView,
  nowMs,
  type NodeView,
} from "@/lib/machines";

// Always run at request time against the live tailnet; never cache or prerender.
export const dynamic = "force-dynamic";

const COLUMNS = [
  "name",
  "hostname",
  "owner",
  "addresses",
  "tags",
  "routes",
  "status",
  "last_seen",
  "os",
  "version",
  "environment",
  "labels",
] as const;

export async function GET(): Promise<Response> {
  try {
    await requireSession();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return new Response("Unauthorized\n", {
        status: 401,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    throw error;
  }

  // Build the same view models the machines page renders, then fold in the
  // Headtower-local metadata. Both the agent enrichment and the metadata read
  // are best-effort, matching the page: an unreachable sidecar or local store
  // just yields empty extras rather than failing the whole export.
  let views: NodeView[];
  try {
    const now = nowMs();
    const [rawList, agents] = await Promise.all([nodesApi.list(), getAgentPeers()]);
    views = withoutAgentNodes(rawList)
      .map((node) =>
        toNodeView(node, now, agents.lookup(node.name, node.ipAddresses ?? [])),
      )
      .sort((a, b) => {
        // Online first, then by name - the operator's reading order.
        if (a.online !== b.online) return a.online ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  } catch {
    return new Response("Unable to reach the control plane\n", {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const metadata = await getNodeMetadataMap(views.map((v) => v.id));

  let body = csvRow(COLUMNS as readonly string[]);
  for (const node of views) {
    body += csvRow(cellsFor(node, metadata.get(node.id)));
  }

  const filename = `headtower-machines-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** The ordered CSV cells for one machine, matching {@link COLUMNS}. */
function cellsFor(
  node: NodeView,
  meta: { environment: string | null; labels: string[] } | undefined,
): string[] {
  return [
    node.name,
    node.hostname,
    ownerLabel(node.user),
    node.addresses.join(" "),
    node.tags.join(" "),
    routesCell(node),
    node.expired ? "expired" : node.online ? "online" : "offline",
    node.lastSeen ?? "",
    agentOsLabel(node.agent) ?? "",
    node.agent?.clientVersion ?? "",
    meta?.environment ?? "",
    (meta?.labels ?? []).join(" "),
  ];
}

/** A compact one-cell summary of a node's exit + subnet + pending routes. */
function routesCell(node: NodeView): string {
  const parts: string[] = [];
  if (node.isExitNode) parts.push("exit");
  else if (node.advertisesExit) parts.push("exit(pending)");
  parts.push(...node.subnetRoutes);
  parts.push(...node.pendingRoutes.map((r) => `${r}(pending)`));
  return parts.join(" ");
}

/** Encode one CSV record (RFC 4180): every cell quoted, quotes doubled, CRLF. */
function csvRow(cells: readonly string[]): string {
  return cells.map(csvCell).join(",") + "\r\n";
}

function csvCell(value: string): string {
  // Neutralize CSV formula injection: a cell beginning with =, +, -, @, or a
  // tab/CR is treated as a formula by spreadsheet apps. Prefix those with a
  // leading apostrophe so the value renders as literal text.
  const s = String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}
