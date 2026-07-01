"use client";

import * as React from "react";
import Link from "next/link";
import { Antenna, Network, Search, SignalHigh, X } from "lucide-react";
import { StatusDot } from "@/components/ui/status-dot";
import { Chip, Tag } from "@/components/ui/chip";
import { Input } from "@/components/ui/field";
import { Kbd } from "@/components/ui/kbd";
import { Sparkline, type ChartTone } from "@/components/charts";
import { cn } from "@/lib/cn";
import {
  nodeDot,
  matchesQuery,
  matchesStatus,
  reachabilitySeries,
  MACHINE_STATUS_FILTERS,
  type StatusFilter,
  type NodeView,
} from "@/lib/machines";

/**
 * The card-grid presentation of the machines list: a denser, host-oriented read
 * of the same nodes the table shows. Each card is a self-contained readout -
 * status, identity, primary address, tags, route/exit markers, last-seen, and a
 * derived recent-reachability sparkline - and links straight to the detail view.
 *
 * It carries its own toolbar (search + status segments) so the two views behave
 * identically; the shared filter grammar lives in `@/lib/machines`. `nowMs` is
 * the server request clock, threaded through so the reachability hint renders
 * the same on the server and after hydration.
 */
export function MachinesCards({
  nodes,
  nowMs,
}: {
  nodes: NodeView[];
  nowMs: number;
}) {
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

      {filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-line-strong px-6 py-12 text-center">
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
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((node) => (
            <HostCard key={node.id} node={node} nowMs={nowMs} />
          ))}
        </div>
      )}
    </div>
  );
}

function HostCard({ node, nowMs }: { node: NodeView; nowMs: number }) {
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

  const os = node.agent?.os ?? null;
  const version = node.agent?.clientVersion ?? null;

  const primaryAddr = node.ipv4 ?? node.ipv6;
  const secondaryAddr = node.ipv4 && node.ipv6 ? node.ipv6 : null;

  const hasMarkers =
    node.isExitNode ||
    node.advertisesExit ||
    node.subnetRoutes.length > 0 ||
    node.pendingRoutes.length > 0 ||
    node.expiresSoon ||
    node.expired;
  const hasTags = node.tags.length > 0 || node.invalidTags.length > 0;

  return (
    <Link
      href={`/machines/${node.id}`}
      className="group flex flex-col gap-3 rounded-card border border-line bg-surface p-3.5 transition-colors hover:border-line-strong hover:bg-surface-2/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40"
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

      {/* Route / exit markers, then tags - one calm, scannable wrap. */}
      {(hasMarkers || hasTags) && (
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
        </div>
      )}

      {/* Footer: last-seen on the left, reachability hint on the right. */}
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
      </div>
    </Link>
  );
}
