"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Antenna, ChevronRight, Network, SignalHigh } from "lucide-react";
import {
  Table,
  TableHead,
  TableBody,
  Tr,
  Th,
  Td,
} from "@/components/ui/table";
import { StatusDot } from "@/components/ui/status-dot";
import { Chip, Tag } from "@/components/ui/chip";
import {
  EnvironmentBadge,
  NodeLabelChips,
} from "@/components/machines/node-metadata-dialog";
import type { NodeMetadataValue } from "@/lib/db/node-metadata-types";
import { NodeActionsMenu } from "@/components/machines/node-actions-menu";
import { MachinesToolbar } from "@/components/machines/machines-toolbar";
import { BulkActionBar } from "@/components/machines/bulk-action-bar";
import { useMachinesFilter } from "@/components/machines/use-machines-filter";
import { cn } from "@/lib/cn";
import {
  agentOsLabel,
  nodeDot,
  ownerLabel,
  type DotStatus,
  type NodeView,
} from "@/lib/machines";

/** Hard ceiling on a selection, matching the bulk Server Actions. */
const MAX_SELECT = 200;

/**
 * Status-edge border color per row - the same status read as the card grid's
 * edge stripe (see machines-cards.tsx), just a 2px rail instead of a 3px one:
 * the table is denser, so a lighter touch on the leading cell reads as an
 * indicator rather than a stripe. Idle (offline, nothing wrong) stays a
 * structural line color rather than a status hue.
 */
const EDGE_BORDER_CLASS: Record<DotStatus, string> = {
  online: "border-l-online-500",
  warn: "border-l-warn-500",
  critical: "border-l-critical-500",
  idle: "border-l-line-strong",
};

function edgeStatus(
  node: Pick<NodeView, "online" | "expired" | "expiresSoon">,
): DotStatus {
  if (node.expired) return "critical";
  if (node.expiresSoon) return "warn";
  return node.online ? "online" : "idle";
}

export function MachinesTable({
  nodes,
  canManage = false,
  knownTags,
  metadata,
}: {
  nodes: NodeView[];
  /**
   * Gates the per-row actions column and the bulk selection column. Computed
   * server-side via `sessionCan("machines.write")` and passed down from the
   * page, matching how the node detail page gates its own Actions card.
   */
  canManage?: boolean;
  /** Tailnet-wide tag suggestions for each row's Edit tags dialog. */
  knownTags?: string[];
  /**
   * Headtower-local per-node metadata (note / environment / labels), keyed by
   * node id. Optional and read-only here: rows surface the environment badge and
   * label chips as quiet context next to the ACL tags.
   */
  metadata?: Record<string, NodeMetadataValue>;
}) {
  const router = useRouter();
  const filter = useMachinesFilter(nodes);
  const { filtered, clear } = filter;

  // Selection is a set of node ids over the VISIBLE (filtered) rows; it prunes
  // itself whenever the filter changes so a hidden row can't stay selected.
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const lastIndexRef = React.useRef<number | null>(null);

  // Prune selections that leave the visible/filtered set. Done during render -
  // the React-recommended way to adjust state when a derived input changes -
  // so it lands before paint without a second effect pass or a cascade.
  const visibleIds = React.useMemo(
    () => new Set(filtered.map((n) => n.id)),
    [filtered],
  );
  const [seenVisible, setSeenVisible] = React.useState(visibleIds);
  if (seenVisible !== visibleIds) {
    setSeenVisible(visibleIds);
    if ([...selected].some((id) => !visibleIds.has(id))) {
      setSelected(new Set([...selected].filter((id) => visibleIds.has(id))));
    }
  }

  const selectedNodes = React.useMemo(
    () => filtered.filter((n) => selected.has(n.id)),
    [filtered, selected],
  );

  const allChecked = filtered.length > 0 && selectedNodes.length === filtered.length;
  const someChecked = selectedNodes.length > 0 && !allChecked;

  const headerRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (headerRef.current) headerRef.current.indeterminate = someChecked;
  }, [someChecked]);

  function toggleAll() {
    lastIndexRef.current = null;
    setSelected((prev) => {
      const visible = filtered.map((n) => n.id);
      const allSel = visible.length > 0 && visible.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSel) {
        for (const id of visible) next.delete(id);
        return next;
      }
      for (const id of visible) {
        if (next.size >= MAX_SELECT) break;
        next.add(id);
      }
      return next;
    });
  }

  function toggleRow(id: string, index: number, shiftKey: boolean) {
    setSelected((prev) => {
      const willSelect = !prev.has(id);
      const next = new Set(prev);
      if (shiftKey && lastIndexRef.current !== null) {
        const from = Math.min(lastIndexRef.current, index);
        const to = Math.max(lastIndexRef.current, index);
        for (let i = from; i <= to; i++) {
          const nid = filtered[i]?.id;
          if (!nid) continue;
          if (willSelect) next.add(nid);
          else next.delete(nid);
        }
      } else if (willSelect) {
        next.add(id);
      } else {
        next.delete(id);
      }
      lastIndexRef.current = index;
      return next.size > MAX_SELECT
        ? new Set([...next].slice(0, MAX_SELECT))
        : next;
    });
  }

  function clearSelection() {
    lastIndexRef.current = null;
    setSelected(new Set());
  }

  function resolveSelection(ids: string[]) {
    const removed = new Set(ids);
    setSelected((prev) => new Set([...prev].filter((id) => !removed.has(id))));
  }

  // Selection + actions each add a leading/trailing column when manageable.
  const columnCount = canManage ? 9 : 7;

  return (
    <div className="flex flex-col gap-3">
      <MachinesToolbar filter={filter} />

      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <Table>
          <TableHead>
            <Tr className="hover:bg-transparent">
              {canManage && (
                <Th className="w-10 pl-4">
                  <input
                    ref={headerRef}
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    aria-label="Select all visible machines"
                    className="h-4 w-4 accent-beacon-500 align-middle"
                  />
                </Th>
              )}
              <Th className={canManage ? undefined : "pl-4"}>Status</Th>
              <Th>Machine</Th>
              <Th>Owner</Th>
              <Th>Addresses</Th>
              <Th>Tags</Th>
              <Th>Routes</Th>
              <Th className={canManage ? undefined : "pr-4"} align="right">
                Last seen
              </Th>
              {canManage && (
                <Th className="pr-4" align="right">
                  <span className="sr-only">Actions</span>
                </Th>
              )}
            </Tr>
          </TableHead>
          <TableBody>
            {filtered.length === 0 ? (
              <Tr className="hover:bg-transparent">
                <Td colSpan={columnCount} className="py-10 text-center">
                  <p className="text-sm text-ink-muted">No machines match.</p>
                  <button
                    type="button"
                    onClick={clear}
                    className="mt-1 text-xs text-beacon-500 hover:underline"
                  >
                    Reset filters
                  </button>
                </Td>
              </Tr>
            ) : (
              filtered.map((node, index) => (
                <MachineRow
                  key={node.id}
                  node={node}
                  canManage={canManage}
                  knownTags={knownTags}
                  metadata={metadata?.[node.id]}
                  selected={selected.has(node.id)}
                  onToggle={(shiftKey) => toggleRow(node.id, index, shiftKey)}
                  onOpen={() => router.push(`/machines/${node.id}`)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {canManage && (
        <BulkActionBar
          selected={selectedNodes}
          onClear={clearSelection}
          onResolve={resolveSelection}
        />
      )}
    </div>
  );
}

function MachineRow({
  node,
  canManage,
  knownTags,
  metadata,
  selected,
  onToggle,
  onOpen,
}: {
  node: NodeView;
  canManage: boolean;
  knownTags?: string[];
  metadata?: NodeMetadataValue;
  selected: boolean;
  onToggle: (shiftKey: boolean) => void;
  onOpen: () => void;
}) {
  const dot = nodeDot(node);
  const edge = edgeStatus(node);
  const visibleTags = node.tags.slice(0, 2);
  const extraTags = node.tags.length - visibleTags.length;
  const env = metadata?.environment ?? null;
  const labels = metadata?.labels ?? [];
  const hasMeta = env != null || labels.length > 0;

  return (
    <Tr
      onClick={onOpen}
      // `group` so the row-hover-revealed open hint and actions kebab below
      // can key off one hover/focus-within state, same as the card grid.
      className={cn("group cursor-pointer", selected && "bg-beacon-500/5")}
    >
      {canManage && (
        // Own click handler so ticking the box doesn't also open the row.
        <Td className="w-10 pl-4" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            // A native change event drops shiftKey, so read it off the click
            // and let onChange keep the box controlled.
            onClick={(e) => onToggle(e.shiftKey)}
            onChange={() => {}}
            aria-label={`Select ${node.name}`}
            className="h-4 w-4 accent-beacon-500 align-middle"
          />
        </Td>
      )}

      {/* Status - the leading cell also carries the row's status-edge rail. */}
      <Td
        className={cn(
          "border-l-2",
          !canManage && "pl-4",
          EDGE_BORDER_CLASS[edge],
        )}
      >
        <div className="flex items-center gap-2">
          <StatusDot status={dot.status} pulse={node.online} />
          <span className="text-xs text-ink-muted">{dot.label}</span>
        </div>
      </Td>

      {/* Machine name + hostname */}
      <Td>
        <Link
          href={`/machines/${node.id}`}
          onClick={(e) => e.stopPropagation()}
          className="block font-medium text-ink hover:text-beacon-500"
        >
          {node.name}
        </Link>
        {node.hostname !== node.name && (
          <span className="data block text-xs text-ink-faint">
            {node.hostname}
          </span>
        )}
        {node.agent && (node.agent.os || node.agent.clientVersion) && (
          <span
            className="data block text-xs text-ink-faint"
            title="Reported by agent"
          >
            {[agentOsLabel(node.agent), node.agent.clientVersion]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </Td>

      {/* Owner */}
      <Td>
        <span className="text-ink-muted">{ownerLabel(node.user)}</span>
      </Td>

      {/* Addresses */}
      <Td data>
        {node.ipv4 && <span className="block text-ink">{node.ipv4}</span>}
        {node.ipv6 && (
          <span className="block truncate text-xs text-ink-faint" title={node.ipv6}>
            {node.ipv6}
          </span>
        )}
        {!node.ipv4 && !node.ipv6 && <span className="text-ink-faint">—</span>}
      </Td>

      {/* Tags - ACL tags first, then quiet Headtower-local metadata chips
          (environment badge + labels) as context next to them. */}
      <Td>
        {node.tags.length === 0 && node.invalidTags.length === 0 && !hasMeta ? (
          <span className="text-ink-faint">—</span>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            {visibleTags.map((tag) => (
              <Tag key={tag}>{tag.replace(/^tag:/, "")}</Tag>
            ))}
            {extraTags > 0 && (
              <Chip variant="default" mono>
                +{extraTags}
              </Chip>
            )}
            {node.invalidTags.length > 0 && (
              <Chip variant="critical" mono title="Tags rejected by policy">
                {node.invalidTags.length} invalid
              </Chip>
            )}
            <EnvironmentBadge environment={env} size="sm" />
            <NodeLabelChips labels={labels} max={2} />
          </div>
        )}
      </Td>

      {/* Routes / markers */}
      <Td>
        <div className="flex flex-wrap items-center gap-1">
          {node.isExitNode && (
            <Chip variant="default" className="gap-1" title="Active exit node">
              <Antenna className="h-3 w-3" aria-hidden />
              exit
            </Chip>
          )}
          {node.advertisesExit && (
            <Chip variant="warn" className="gap-1" title="Exit node awaiting approval">
              <Antenna className="h-3 w-3" aria-hidden />
              exit pending
            </Chip>
          )}
          {node.subnetRoutes.length > 0 && (
            <Chip
              variant="default"
              mono
              className="gap-1"
              title={node.subnetRoutes.join(", ")}
            >
              <Network className="h-3 w-3" aria-hidden />
              {node.subnetRoutes.length}
            </Chip>
          )}
          {node.pendingRoutes.length > 0 && (
            <Chip
              variant="warn"
              mono
              title={`${node.pendingRoutes.length} route(s) awaiting approval`}
            >
              {node.pendingRoutes.length} pending
            </Chip>
          )}
          {node.expiresSoon && (
            <Chip variant="warn" title="Key expires soon">
              expiring
            </Chip>
          )}
          {!node.isExitNode &&
            !node.advertisesExit &&
            node.subnetRoutes.length === 0 &&
            node.pendingRoutes.length === 0 &&
            !node.expiresSoon && <span className="text-ink-faint">—</span>}
        </div>
      </Td>

      {/* Last seen - trailed by a row-hover-revealed open hint, same calm
          resting state as the card grid's chevron. */}
      <Td className={canManage ? undefined : "pr-4"} align="right">
        <span className="inline-flex items-center justify-end gap-2">
          {node.online ? (
            <span className="inline-flex items-center gap-1 text-xs text-online-600">
              <SignalHigh className="h-3.5 w-3.5" aria-hidden />
              connected
            </span>
          ) : (
            <span className="data text-xs text-ink-muted" title={node.lastSeen ?? "never"}>
              {node.lastSeenLabel}
            </span>
          )}
          <ChevronRight
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          />
        </span>
      </Td>

      {/* Actions - own click handler so it doesn't also trigger the row's
          onOpen. Hover/focus-revealed to keep the resting row calm; stays
          visible while the menu itself is open via Radix's data-state. */}
      {canManage && (
        <Td className="pr-4" align="right" onClick={(e) => e.stopPropagation()}>
          <NodeActionsMenu
            nodeId={node.id}
            name={node.name}
            tags={node.tags}
            knownTags={knownTags}
            className="ml-auto opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100"
          />
        </Td>
      )}
    </Tr>
  );
}
