"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/field";
import { Kbd } from "@/components/ui/kbd";
import { SegmentedTabs } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import { MACHINE_STATUS_FILTERS } from "@/lib/machines";
import type { MachinesFilter } from "@/components/machines/use-machines-filter";

/**
 * The machines list toolbar, shared verbatim by the table and card views: a
 * live "shown / total" readout, the status segments (a `SegmentedTabs` on md+,
 * a bordered fallback on mobile), and a keyboard-first filter box that "/"
 * focuses from anywhere on the view. Filter state is URL-backed and owned by
 * `useMachinesFilter`; this is the presentational half, driven by the slice of
 * that hook passed in.
 *
 * When any filter is active - including a `?user=` / `?tag=` deep-link - it
 * surfaces the active scope as chips and a Clear affordance.
 */
export function MachinesToolbar({
  filter,
}: {
  filter: MachinesFilter;
}) {
  const {
    filtered,
    total,
    onlineCount,
    state,
    active,
    setQuery,
    setStatus,
    setUser,
    setTag,
    clear,
  } = filter;
  const searchRef = React.useRef<HTMLInputElement>(null);

  const statusLabel =
    MACHINE_STATUS_FILTERS.find((f) => f.id === state.status)?.label ??
    state.status;

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

  const statusOptions = MACHINE_STATUS_FILTERS.map((f) => ({
    value: f.id,
    label: f.label,
  }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-ink-muted">
          <span className="data text-ink">{filtered.length}</span>
          <span className="text-ink-faint"> of </span>
          <span className="data">{total}</span> machines
          <span className="text-ink-faint"> · </span>
          <span className="data text-online-600">{onlineCount}</span> online
        </p>

        <div className="flex items-center gap-2">
          <SegmentedTabs
            options={statusOptions}
            value={state.status}
            onValueChange={setStatus}
            ariaLabel="Filter by status"
            className="hidden md:flex"
          />

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
              aria-hidden
            />
            <Input
              ref={searchRef}
              value={state.query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQuery("");
              }}
              placeholder="Filter machines"
              aria-label="Filter machines"
              className="h-8 w-56 pl-8 pr-16 text-xs"
            />
            {state.query ? (
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

      {/* Mobile status segments (the SegmentedTabs set is hidden under md). */}
      <div className="flex items-center gap-1 md:hidden">
        {MACHINE_STATUS_FILTERS.map((f) => {
          const isActive = state.status === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatus(f.id)}
              aria-pressed={isActive}
              className={cn(
                "rounded-control border px-2 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "border-line-strong bg-surface-2 text-ink"
                  : "border-line text-ink-muted hover:text-ink",
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Active-scope readout: one dismissible pill per live filter dimension,
          each dropping just that one, plus a clear-all affordance. */}
      {active && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
          <span className="mr-0.5 text-ink-faint">Filtered</span>
          {state.status !== "all" && (
            <FilterPill
              label="status"
              value={statusLabel}
              onDismiss={() => setStatus("all")}
            />
          )}
          {state.query && (
            <FilterPill
              label="search"
              value={state.query}
              onDismiss={() => setQuery("")}
            />
          )}
          {state.user && (
            <FilterPill
              label="owner"
              value={state.user}
              onDismiss={() => setUser(null)}
            />
          )}
          {state.tag && (
            <FilterPill
              label="tag"
              value={state.tag.replace(/^tag:/, "")}
              onDismiss={() => setTag(null)}
            />
          )}
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1 rounded-control px-1.5 py-0.5 font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * A single active-filter pill: a quiet, schematic `label: value` token with an
 * x that drops just that one filter dimension. The clear-all button beside the
 * pill row still resets everything at once.
 */
function FilterPill({
  label,
  value,
  onDismiss,
}: {
  label: string;
  value: string;
  onDismiss: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-control border border-line bg-surface-2 py-0.5 pl-2 pr-1 text-ink-muted">
      <span className="text-ink-faint">{label}</span>
      <span className="data max-w-[12rem] truncate text-ink" title={value}>
        {value}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Remove ${label} filter`}
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-[0.2rem] text-ink-faint transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}
