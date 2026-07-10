"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import type { AuditDetail as AuditDetailValue } from "@/lib/db";
import { cn } from "@/lib/cn";
import { summarizeDetail } from "./format";

export interface AuditDetailProps {
  detail: AuditDetailValue | null | undefined;
  className?: string;
}

/**
 * The audit trail's structured `detail` column: a truncated one-line summary
 * that expands, on click, into the raw pretty-printed JSON. Shared by the
 * desktop `Td` and the small-screen `CardRowField` so a row's detail is
 * equally reachable whether it scrolled off in a wide table or stacked into a
 * card - a hover-only `title` tooltip (the previous behaviour) has no
 * equivalent on touch.
 */
export function AuditDetail({ detail, className }: AuditDetailProps) {
  const [open, setOpen] = React.useState(false);
  const summary = summarizeDetail(detail);

  if (!summary) {
    return <span className={cn("text-ink-faint", className)}>·</span>;
  }

  return (
    <div className={cn("min-w-0", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="data group flex w-full max-w-full items-center gap-1 text-left text-xs text-ink-muted transition-colors hover:text-ink"
      >
        <span className={cn("min-w-0", !open && "truncate")} title={open ? undefined : summary}>
          {summary}
        </span>
        <ChevronRight
          aria-hidden
          className={cn(
            "h-3 w-3 shrink-0 text-ink-faint transition-transform group-hover:text-ink",
            open && "rotate-90",
          )}
        />
      </button>
      {open && (
        <pre className="data mt-1.5 max-h-64 max-w-full overflow-auto rounded-control border border-line bg-surface-2 px-2 py-1.5 text-[11px] leading-relaxed text-ink-muted">
          {JSON.stringify(detail, null, 2)}
        </pre>
      )}
    </div>
  );
}
