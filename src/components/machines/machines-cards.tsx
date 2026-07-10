"use client";

import * as React from "react";
import Link from "next/link";
import { Antenna, ChevronRight, Network, SignalHigh } from "lucide-react";
import { StatusDot } from "@/components/ui/status-dot";
import { Chip, Tag } from "@/components/ui/chip";
import { Sparkline, type ChartTone } from "@/components/charts";
import {
  EnvironmentBadge,
  NodeLabelChips,
} from "@/components/machines/node-metadata-dialog";
import type { NodeMetadataValue } from "@/lib/db/node-metadata-types";
import { NodeActionsMenu } from "@/components/machines/node-actions-menu";
import { RowQuickActions } from "@/components/machines/row-quick-actions";
import { MachinesToolbar } from "@/components/machines/machines-toolbar";
import { BulkActionBar } from "@/components/machines/bulk-action-bar";
import { useMachinesFilter } from "@/components/machines/use-machines-filter";
import { cn } from "@/lib/cn";
import {
  agentOsLabel,
  nodeDot,
  reachabilitySeries,
  type NodeView,
} from "@/lib/machines";

/** Hard ceiling on a selection, matching the bulk Server Actions. */
const MAX_SELECT = 200;

/**
 * The card-grid presentation of the machines list: a denser, host-oriented read
 * of the same nodes the table shows. Each card is a self-contained readout -
 * status, identity, primary address, tags, route/exit markers, last-seen, and a
 * derived recent-reachability sparkline - and links straight to the detail view.
 *
 * It shares the URL-backed toolbar/filter and the bulk action bar with the
 * table view, so switching presentations preserves both the active filter and
 * the working selection. `nowMs` is the server request clock, threaded through
 * so the reachability hint renders the same on the server and after hydration.
 */
export function MachinesCards({
  nodes,
  nowMs,
  canManage = false,
  knownTags,
  metadata,
}: {
  nodes: NodeView[];
  nowMs: number;
  /**
   * Gates the per-card actions kebab and the bulk selection affordance.
   * Computed server-side via `sessionCan("machines.write")` and passed down
   * from the page, matching how the node detail page gates its own Actions card.
   */
  canManage?: boolean;
  /** Tailnet-wide tag suggestions for each card's Edit tags dialog. */
  knownTags?: string[];
  /**
   * Headtower-local per-node metadata (note / environment / labels), keyed by
   * node id. Optional and read-only here: cards surface the environment badge
   * and label chips as quiet context alongside the ACL tags.
   */
  metadata?: Record<string, NodeMetadataValue>;
}) {
  const filter = useMachinesFilter(nodes, metadata);
  const { filtered, clear } = filter;

  // Selection over the VISIBLE (filtered) cards; prunes itself on filter change.
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

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

  function toggleCard(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_SELECT) next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function resolveSelection(ids: string[]) {
    const removed = new Set(ids);
    setSelected((prev) => new Set([...prev].filter((id) => !removed.has(id))));
  }

  return (
    <div className="flex flex-col gap-3">
      <MachinesToolbar filter={filter} />

      {filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-line-strong px-6 py-12 text-center">
          <p className="text-sm text-ink-muted">No machines match.</p>
          <button
            type="button"
            onClick={clear}
            className="mt-1 text-xs text-beacon-500 hover:underline"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((node) => (
            <HostCard
              key={node.id}
              node={node}
              nowMs={nowMs}
              canManage={canManage}
              knownTags={knownTags}
              metadata={metadata?.[node.id]}
              selected={selected.has(node.id)}
              onToggle={() => toggleCard(node.id)}
            />
          ))}
        </div>
      )}

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

function HostCard({
  node,
  nowMs,
  canManage,
  knownTags,
  metadata,
  selected,
  onToggle,
}: {
  node: NodeView;
  nowMs: number;
  canManage: boolean;
  knownTags?: string[];
  metadata?: NodeMetadataValue;
  selected: boolean;
  onToggle: () => void;
}) {
  const dot = nodeDot(node);
  const series = React.useMemo(
    () => reachabilitySeries(node, nowMs),
    [node, nowMs],
  );
  const reachTone: ChartTone = node.expired
    ? "critical"
    : node.online
      ? "online"
      : "warn";

  const visibleTags = node.tags.slice(0, 3);
  const extraTags = node.tags.length - visibleTags.length;

  const os = agentOsLabel(node.agent);
  const version = node.agent?.clientVersion ?? null;

  const primaryAddr = node.ipv4 ?? node.ipv6;
  const secondaryAddr = node.ipv4 && node.ipv6 ? node.ipv6 : null;

  const env = metadata?.environment ?? null;
  const labels = metadata?.labels ?? [];
  const hasMeta = env != null || labels.length > 0;

  const hasMarkers =
    node.isExitNode ||
    node.advertisesExit ||
    node.subnetRoutes.length > 0 ||
    node.pendingRoutes.length > 0 ||
    node.expiresSoon ||
    node.expired;
  const hasTags = node.tags.length > 0 || node.invalidTags.length > 0;

  return (
    // Relative wrapper so the actions kebab and selection checkbox can float in
    // the corners as siblings of the card's Link - nesting an interactive
    // trigger inside the anchor would double up on clicks (both "toggle" and
    // "navigate"). `group` lives here (not on the Link) so both the Link's own
    // descendants and the sibling controls can react to one hover state.
    <div className="group relative h-full">
      <Link
        href={`/machines/${node.id}`}
        className={cn(
          "relative flex h-full flex-col gap-3 overflow-hidden rounded-card border bg-surface p-3.5 transition-colors hover:border-line-strong hover:bg-surface-2/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-beacon-500/40",
          selected ? "border-beacon-500/50 bg-beacon-500/5" : "border-line",
          canManage && "pr-9",
          canManage && "pl-9",
        )}
      >
        {/* Identity: status dot + name, with agent OS / version to the right. */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <StatusDot
              status={dot.status}
              pulse={node.online}
              className="mt-1"
            />
            <div className="min-w-0">
              <div className="truncate font-medium text-ink group-hover:text-beacon-500">
                {node.name}
              </div>
              {node.hostname !== node.name && (
                <div className="data truncate text-xs text-ink-faint">
                  {node.hostname}
                </div>
              )}
            </div>
          </div>
          {(os || version) && (
            <div className="shrink-0 text-right" title="Reported by agent">
              {os && <div className="text-xs text-ink-muted">{os}</div>}
              {version && (
                <div className="data text-[11px] text-ink-faint">{version}</div>
              )}
            </div>
          )}
        </div>

        {/* Primary address (mono readout). */}
        <div className="min-w-0">
          {primaryAddr ? (
            <>
              <div className="data truncate text-sm text-ink" title={primaryAddr}>
                {primaryAddr}
              </div>
              {secondaryAddr && (
                <div
                  className="data truncate text-xs text-ink-faint"
                  title={secondaryAddr}
                >
                  {secondaryAddr}
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-ink-faint">No address</div>
          )}
        </div>

        {/* Route / exit markers, then tags, then quiet Headtower-local
            metadata chips (environment + labels) - one calm, scannable wrap. */}
        {(hasMarkers || hasTags || hasMeta) && (
          <div className="flex flex-wrap items-center gap-1">
            {node.isExitNode && (
              <Chip variant="default" className="gap-1" title="Active exit node">
                <Antenna className="h-3 w-3" aria-hidden />
                exit
              </Chip>
            )}
            {node.advertisesExit && (
              <Chip
                variant="warn"
                className="gap-1"
                title="Exit node awaiting approval"
              >
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
            {node.expired && (
              <Chip variant="critical" title="Key expired">
                expired
              </Chip>
            )}
            {node.expiresSoon && (
              <Chip variant="warn" title="Key expires soon">
                expiring
              </Chip>
            )}
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
            <NodeLabelChips labels={labels} max={3} />
          </div>
        )}

        {/* Footer: last-seen on the left, reachability hint + open hint on
            the right. The chevron is a resting-state-calm affordance, not a
            control - it fades in with the rest of the card's hover state. */}
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-2.5">
          {node.online ? (
            <span className="inline-flex items-center gap-1 text-xs text-online-600">
              <SignalHigh className="h-3.5 w-3.5" aria-hidden />
              connected
            </span>
          ) : (
            <span
              className="data text-xs text-ink-muted"
              title={node.lastSeen ?? "never"}
            >
              {node.lastSeenLabel}
            </span>
          )}

          <div className="flex items-center gap-2">
            {series.length > 0 && (
              <Sparkline
                data={series}
                tone={reachTone}
                min={0}
                max={1}
                area
                className="h-6 w-24"
                aria-label={`Recent reachability for ${node.name}`}
                title={`Recent reachability - ${node.online ? "online" : node.lastSeenLabel}`}
              />
            )}
            <ChevronRight
              aria-hidden
              className="h-3.5 w-3.5 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            />
          </div>
        </div>
      </Link>

      {canManage && (
        <label
          // A sibling of the Link so ticking it never navigates. Kept discreet
          // until hovered or checked, mirroring the kebab's resting calm.
          className={cn(
            "absolute left-2.5 top-3 inline-flex cursor-pointer items-center transition-opacity",
            selected
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
          )}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`Select ${node.name}`}
            className="h-4 w-4 accent-beacon-500"
          />
        </label>
      )}

      {canManage && (
        // Top-right control cluster: a hover/focus-revealed quick-action pair
        // (open terminal, copy IP) sits just left of the kebab. Each carries its
        // own translucent backdrop so it stays legible over the card's OS/version
        // readout, mirroring the kebab's resting calm.
        <div className="absolute right-2.5 top-2.5 flex items-center gap-0.5">
          <RowQuickActions
            node={node}
            className="rounded-control bg-surface/80 backdrop-blur-sm"
          />
          <NodeActionsMenu
            nodeId={node.id}
            name={node.name}
            tags={node.tags}
            knownTags={knownTags}
            className="bg-surface/80 opacity-0 backdrop-blur-sm transition-opacity duration-150 hover:bg-surface-2 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100"
          />
        </div>
      )}
    </div>
  );
}
