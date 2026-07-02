"use client";

import * as React from "react";
import { ChevronRight, CircleCheck, ListChecks, TriangleAlert } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/cn";
import type { LintFinding } from "@/lib/policy";

interface LintPanelProps {
  findings: LintFinding[];
  /** False when the current document can't be parsed into a model yet. */
  ready: boolean;
}

/**
 * The advisory lint strip beneath the editor. Purely informational - it never
 * blocks a save. Collapsed by default so it doesn't steal editor height; the
 * count chip signals when there's something to look at. Each finding shows a
 * location chip (e.g. `acls[2].src`) pointing at the offending spot.
 */
export function LintPanel({ findings, ready }: LintPanelProps) {
  const [open, setOpen] = React.useState(false);
  const count = findings.length;

  const summary = !ready ? (
    <span className="text-ink-faint">
      Advisories resume once the document parses.
    </span>
  ) : count === 0 ? (
    <span className="flex items-center gap-1.5 text-online-500">
      <CircleCheck className="h-3.5 w-3.5" aria-hidden />
      No advisories
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-warn-500">
      <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
      {count} advisor{count === 1 ? "y" : "ies"}
    </span>
  );

  const expandable = ready && count > 0;

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface-2/40">
      <button
        type="button"
        disabled={!expandable}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={expandable ? open : undefined}
        className={cn(
          "flex w-full items-center gap-2 px-4 py-2 text-[11px]",
          expandable
            ? "cursor-pointer hover:bg-surface-2"
            : "cursor-default",
        )}
      >
        <ListChecks className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
        <span className="font-medium text-ink-muted">Lint</span>
        {summary}
        {expandable && (
          <ChevronRight
            className={cn(
              "ml-auto h-3.5 w-3.5 text-ink-faint transition-transform",
              open && "rotate-90",
            )}
            aria-hidden
          />
        )}
      </button>

      {expandable && open && (
        <ul className="max-h-40 overflow-y-auto border-t border-line/60 px-4 py-2">
          {findings.map((f) => (
            <li
              key={f.id}
              className="flex items-start gap-2 py-1 text-[11px] first:pt-0.5"
            >
              <TriangleAlert
                className="mt-0.5 h-3 w-3 shrink-0 text-warn-500"
                aria-hidden
              />
              <span className="min-w-0 flex-1 text-ink-muted">{f.message}</span>
              <Chip mono variant="outline" className="shrink-0">
                {f.location}
              </Chip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
