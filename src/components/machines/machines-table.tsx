"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Antenna, ChevronRight, Network, Search, SignalHigh, X } from "lucide-react";
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
import { Input } from "@/components/ui/field";
import { Kbd } from "@/components/ui/kbd";
import { NodeActionsMenu } from "@/components/machines/node-actions-menu";
import { cn } from "@/lib/cn";
import {
  agentOsLabel,
  nodeDot,
  ownerLabel,
  matchesQuery,
  matchesStatus,
  MACHINE_STATUS_FILTERS,
  type DotStatus,
  type StatusFilter,
  type NodeView,
} from "@/lib/machines";

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
}: {
  nodes: NodeView[];
  /**
   * Gates the per-row actions column. Computed server-side via
   * `sessionCan("machines.write")` and passed down from the page, matching
   * how the node detail page gates its own Actions card.
   */
  canManage?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const searchRef = React.useRef<HTMLInputElement>(null);

  // Keyboard-first: "/" focuses the filter from anywhere on the view.
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = React.useMemo(
    () =>
      nodes.filter(
        (node) => matchesStatus(node, status) && matchesQuery(node, query),
      ),
    [nodes, status, query],
  );

  const onlineCount = React.useMemo(
    () => nodes.filter((n) => n.online && !n.expired).length,
    [nodes],
  );

  // One extra column for the actions kebab when the session can manage nodes.
  const columnCount = canManage ? 8 : 7;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar: live count on the left, status segments + filter on the right. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-ink-muted">
          <span className="data text-ink">{filtered.length}</span>
          <span className="text-ink-faint"> / </span>
          <span className="data">{nodes.length}</span> machines
          <span className="text-ink-faint"> · </span>
          <span className="data text-online-600">{onlineCount}</span> online
        </p>

        <div className="flex items-center gap-2">
          <div
            className="hidden items-center gap-0.5 rounded-control border border-line bg-surface-2 p-0.5 md:flex"
            role="tablist"
            aria-label="Filter by status"
          >
            {MACHINE_STATUS_FILTERS.map((f) => {
              const active = status === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStatus(f.id)}
                  className={cn(
                    "rounded-[0.4rem] px-2.5 py-1 text-xs font-medium transition-colors",
                    active
                      ? "bg-surface text-ink shadow-sm"
                      : "text-ink-muted hover:text-ink",
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
              aria-hidden
            />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQuery("");
              }}
              placeholder="Filter machines"
              aria-label="Filter machines"
              className="h-8 w-56 pl-8 pr-16 text-xs"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear filter"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint transition-colors hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <Kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                /
              </Kbd>
            )}
          </div>
        </div>
      </div>

      {/* Mobile status segments (the toolbar set is hidden under md). */}
      <div className="flex items-center gap-1 md:hidden">
        {MACHINE_STATUS_FILTERS.map((f) => {
          const active = status === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatus(f.id)}
              aria-pressed={active}
              className={cn(
                "rounded-control border px-2 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-line-strong bg-surface-2 text-ink"
                  : "border-line text-ink-muted hover:text-ink",
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <Table>
          <TableHead>
            <Tr className="hover:bg-transparent">
              <Th className="pl-4">Status</Th>
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
                    onClick={() => {
                      setQuery("");
                      setStatus("all");
                    }}
                    className="mt-1 text-xs text-beacon-500 hover:underline"
                  >
                    Reset filters
                  </button>
                </Td>
              </Tr>
            ) : (
              filtered.map((node) => (
                <MachineRow
                  key={node.id}
                  node={node}
                  canManage={canManage}
                  onOpen={() => router.push(`/machines/${node.id}`)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function MachineRow({
  node,
  canManage,
  onOpen,
}: {
  node: NodeView;
  canManage: boolean;
  onOpen: () => void;
}) {
  const dot = nodeDot(node);
  const edge = edgeStatus(node);
  const visibleTags = node.tags.slice(0, 2);
  const extraTags = node.tags.length - visibleTags.length;

  return (
    <Tr
      onClick={onOpen}
      // `group` so the row-hover-revealed open hint and actions kebab below
      // can key off one hover/focus-within state, same as the card grid.
      className="group cursor-pointer"
    >
      {/* Status - the leading cell also carries the row's status-edge rail. */}
      <Td className={cn("border-l-2 pl-4", EDGE_BORDER_CLASS[edge])}>
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

      {/* Tags */}
      <Td>
        {node.tags.length === 0 && node.invalidTags.length === 0 ? (
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
            className="ml-auto opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100"
          />
        </Td>
      )}
    </Tr>
  );
}
