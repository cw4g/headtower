"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/field";
import { Kbd } from "@/components/ui/kbd";
import { Chip } from "@/components/ui/chip";
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
  const { filtered, total, onlineCount, state, active, setQuery, setStatus, clear } =
    filter;
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

      {/* Active-scope readout: deep-link owner / tag chips + a Clear affordance. */}
      {active && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <span className="text-ink-faint">Filtered</span>
          {state.user && (
            <Chip variant="beacon">
              owner: <span className="data ml-1">{state.user}</span>
            </Chip>
          )}
          {state.tag && (
            <Chip variant="beacon">
              tag: <span className="data ml-1">{state.tag.replace(/^tag:/, "")}</span>
            </Chip>
          )}
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1 rounded-control px-1.5 py-0.5 font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
