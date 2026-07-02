"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Optional leading glyph (e.g. the view-toggle's Table / Cards icons). */
  icon?: LucideIcon;
  /** Grey out and skip in keyboard navigation without unmounting. */
  disabled?: boolean;
}

export interface SegmentedTabsProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** Accessible name for the tablist. */
  ariaLabel: string;
  /** Disable every segment (e.g. while a transition is in flight). */
  disabled?: boolean;
  /** Let the segments wrap onto a second line (the dialog tab sets do). */
  wrap?: boolean;
  className?: string;
}

/**
 * The rounded-control segmented switch used across the console: a
 * `border bg-surface-2 p-0.5` rail of segments where the active one lifts onto
 * a `bg-surface` chip. Hand-rolled copies of this lived in the machines table,
 * card grid, view toggle, and the Add device dialog; this consolidates them and
 * adds proper tablist keyboard behaviour - roving tabindex, arrow keys wrap
 * around, Home / End jump to the ends, and disabled segments are skipped.
 *
 * Activation follows focus (arrowing to a segment selects it), the common
 * pattern for a compact filter/mode switch where the panels are cheap to swap.
 */
export function SegmentedTabs<T extends string>({
  options,
  value,
  onValueChange,
  ariaLabel,
  disabled = false,
  wrap = false,
  className,
}: SegmentedTabsProps<T>) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // The selected segment is the one tab stop; if the value matches nothing
  // (shouldn't happen) fall back to the first so the control stays reachable.
  const activeIndex = options.findIndex((o) => o.value === value);
  const focusIndex = activeIndex === -1 ? 0 : activeIndex;

  /** Next enabled segment index from `from` in `dir`, wrapping around. */
  function nextEnabled(from: number, dir: 1 | -1): number {
    const count = options.length;
    for (let step = 1; step <= count; step++) {
      const i = (from + dir * step + count * step) % count;
      if (!options[i].disabled) return i;
    }
    return from;
  }

  function firstEnabled(): number {
    const i = options.findIndex((o) => !o.disabled);
    return i === -1 ? 0 : i;
  }

  function lastEnabled(): number {
    for (let i = options.length - 1; i >= 0; i--) {
      if (!options[i].disabled) return i;
    }
    return 0;
  }

  function focusSelect(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    refs.current[index]?.focus();
    if (option.value !== value) onValueChange(option.value);
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusSelect(nextEnabled(index, 1));
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusSelect(nextEnabled(index, -1));
        break;
      case "Home":
        event.preventDefault();
        focusSelect(firstEnabled());
        break;
      case "End":
        event.preventDefault();
        focusSelect(lastEnabled());
        break;
    }
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "flex items-center gap-0.5 rounded-control border border-line bg-surface-2 p-0.5",
        wrap && "flex-wrap",
        className,
      )}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        const isDisabled = disabled || option.disabled;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={index === focusIndex ? 0 : -1}
            disabled={isDisabled}
            onClick={() => onValueChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[0.4rem] px-2.5 py-1 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40",
              "disabled:pointer-events-none disabled:opacity-50",
              active
                ? "bg-surface text-ink shadow-sm"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
