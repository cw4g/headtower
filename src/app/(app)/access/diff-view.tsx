"use client";

import * as React from "react";
import { GitCompare } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/cn";

interface DiffViewProps {
  /** The baseline being compared against. */
  before: string;
  /** The document whose changes are being shown. */
  after: string;
  /**
   * Copy for the "nothing differs" state. Defaulted for the Review tab, which
   * compares the editor against the saved policy; the History tab compares a
   * stored revision against what is running and needs to say so.
   */
  emptyTitle?: string;
  emptyDescription?: string;
}

type DiffKind = "context" | "add" | "remove";

interface DiffRow {
  kind: DiffKind;
  /** 1-based line number in the "before" document, or null for additions. */
  beforeNo: number | null;
  /** 1-based line number in the "after" document, or null for removals. */
  afterNo: number | null;
  text: string;
}

/**
 * A line-based unified diff via a classic LCS. Small policy documents make the
 * O(n*m) table cheap, and a unified layout reads far better than side-by-side on
 * the narrow workbench column. Returns rows ready to render, plus the add/remove
 * tallies for the summary.
 */
export function diffLines(before: string, after: string): {
  rows: DiffRow[];
  added: number;
  removed: number;
} {
  const a = before.length ? before.split("\n") : [];
  const b = after.length ? after.split("\n") : [];
  const n = a.length;
  const m = b.length;

  // LCS length table.
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ kind: "context", beforeNo: i + 1, afterNo: j + 1, text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      rows.push({ kind: "remove", beforeNo: i + 1, afterNo: null, text: a[i] });
      removed++;
      i++;
    } else {
      rows.push({ kind: "add", beforeNo: null, afterNo: j + 1, text: b[j] });
      added++;
      j++;
    }
  }
  while (i < n) {
    rows.push({ kind: "remove", beforeNo: i + 1, afterNo: null, text: a[i] });
    removed++;
    i++;
  }
  while (j < m) {
    rows.push({ kind: "add", beforeNo: null, afterNo: j + 1, text: b[j] });
    added++;
    j++;
  }

  return { rows, added, removed };
}

const KIND_STYLE: Record<DiffKind, { row: string; sign: string; glyph: string }> = {
  context: { row: "", sign: "text-ink-faint", glyph: " " },
  add: {
    row: "bg-online-500/10",
    sign: "text-online-500",
    glyph: "+",
  },
  remove: {
    row: "bg-critical-500/10",
    sign: "text-critical-500",
    glyph: "-",
  },
};

/**
 * The Review tab: a unified diff of the saved policy against the current edit.
 * When nothing changed it shows a "No changes" empty state so the operator knows
 * a save would be a no-op.
 */
export function DiffView({
  before,
  after,
  emptyTitle,
  emptyDescription,
}: DiffViewProps) {
  const { rows, added, removed } = React.useMemo(
    () => diffLines(before, after),
    [before, after],
  );

  if (before === after) {
    return (
      <EmptyState
        icon={GitCompare}
        title={emptyTitle ?? "No changes"}
        description={
          emptyDescription ??
          "The editor matches the saved policy. There's nothing to review or commit."
        }
      />
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line bg-surface-2/40 px-4 py-2 text-[11px]">
        <span className="text-ink-faint">Saved</span>
        <span className="text-ink-faint" aria-hidden>
          &rarr;
        </span>
        <span className="text-ink-muted">Edited</span>
        <span className="ml-auto flex items-center gap-2">
          <Chip mono variant="online">
            +{added}
          </Chip>
          <Chip mono variant="critical">
            &minus;{removed}
          </Chip>
        </span>
      </div>
      <div className="data overflow-x-auto text-[13px] leading-[1.5rem]">
        {rows.map((row, idx) => {
          const style = KIND_STYLE[row.kind];
          return (
            <div
              key={idx}
              className={cn("flex whitespace-pre", style.row)}
            >
              <span className="w-12 shrink-0 select-none border-r border-line/60 px-2 text-right text-ink-faint/70">
                {row.beforeNo ?? ""}
              </span>
              <span className="w-12 shrink-0 select-none border-r border-line/60 px-2 text-right text-ink-faint/70">
                {row.afterNo ?? ""}
              </span>
              <span
                className={cn("w-5 shrink-0 select-none text-center", style.sign)}
                aria-hidden
              >
                {style.glyph}
              </span>
              <span className="min-w-0 flex-1 pr-4 text-ink">{row.text || " "}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
