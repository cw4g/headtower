/**
 * Donut — a distribution ring with a center readout and an optional legend.
 * Built from stroke-dash arcs (no arc-path maths, handles a single 100% slice
 * cleanly). Slices without an explicit tone fall back to a quiet opacity ramp
 * of `ink` (a theme-flipping token, unlike a fixed graphite shade) so the ring
 * stays schematic and legible in both themes; pass `tone` per slice for
 * semantic colours (online / warn / critical) and reserve `beacon` for the
 * one slice to feature.
 */
import * as React from "react";
import { cn } from "@/lib/cn";
import {
  type ChartTone,
  toneStroke,
  toneBg,
  formatCompact,
  sum,
} from "./shared";

export interface DonutSlice {
  label: string;
  value: number;
  tone?: ChartTone;
}

export interface DonutProps {
  data: DonutSlice[];
  /** svg size in coordinate units (renders square). */
  size?: number;
  /** Ring thickness. */
  thickness?: number;
  /** Big center value (defaults to the total). */
  centerValue?: React.ReactNode;
  /** Small caption under the center value. */
  centerLabel?: React.ReactNode;
  /** Show the legend beside the ring (default true). */
  legend?: boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * Quiet monochrome ramp for un-toned slices, beacon leading. Opacity steps of
 * `ink` rather than fixed graphite shades, so every step still contrasts
 * against the `surface-2` track once `ink` itself flips for the theme.
 *
 * Steps are validated (CVD-simulated adjacent-pair ΔE ≥ 15 and ≥ 3:1 against
 * both theme surfaces) — identity is carried by the legend and the slice gaps,
 * not by hue, so don't add steps without re-checking those two properties.
 */
const RAMP: { stroke: string; bg: string }[] = [
  { stroke: "stroke-beacon-500", bg: "bg-beacon-500" },
  { stroke: "stroke-ink/90", bg: "bg-ink/90" },
  { stroke: "stroke-ink/70", bg: "bg-ink/70" },
  { stroke: "stroke-ink/50", bg: "bg-ink/50" },
  { stroke: "stroke-ink/80", bg: "bg-ink/80" },
  { stroke: "stroke-ink/60", bg: "bg-ink/60" },
];

function sliceColor(slice: DonutSlice, i: number): { stroke: string; bg: string } {
  if (slice.tone) return { stroke: toneStroke[slice.tone], bg: toneBg[slice.tone] };
  return RAMP[i % RAMP.length];
}

/**
 * A ramp step never repeats: past the ramp's reach the smallest slices fold
 * into a single neutral "Other" so two different entities can't wear the same
 * colour. Toned slices keep their semantic colour and never fold.
 */
function foldOverflow(data: DonutSlice[]): DonutSlice[] {
  const untonedCount = data.filter((d) => !d.tone).length;
  if (untonedCount <= RAMP.length) return data;
  const keep = RAMP.length - 1;
  const untonedSorted = data
    .filter((d) => !d.tone)
    .sort((a, b) => b.value - a.value);
  const folded = new Set(untonedSorted.slice(keep));
  const other = sum([...folded].map((d) => Math.max(d.value, 0)));
  const kept = data.filter((d) => !folded.has(d));
  return [...kept, { label: "Other", value: other, tone: "neutral" }];
}

export function Donut({
  data: rawData,
  size = 168,
  thickness = 18,
  centerValue,
  centerLabel,
  legend = true,
  className,
  "aria-label": ariaLabel,
}: DonutProps) {
  const data = foldOverflow(rawData);
  const c = size / 2;
  const radius = c - thickness / 2 - 1;
  const total = sum(data.map((d) => Math.max(d.value, 0)));
  const center = centerValue ?? formatCompact(total);

  const label =
    ariaLabel ??
    (total > 0
      ? `Distribution: ${data
          .map((d) => `${d.label} ${Math.round((d.value / total) * 100)}%`)
          .join(", ")}`
      : "Distribution: no data");

  // Cumulative fractions drive each arc's rotation start (n is tiny).
  const fracs = data.map((d) => (total > 0 ? Math.max(d.value, 0) / total : 0));
  const arcs = data.map((slice, i) => ({
    slice,
    i,
    frac: fracs[i],
    start: fracs.slice(0, i).reduce((s, f) => s + f, 0),
    ...sliceColor(slice, i),
  }));

  return (
    <div className={cn("flex flex-wrap items-center gap-5", className)}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={label}
        className="block h-auto shrink-0"
        style={{ width: size }}
      >
        <title>{label}</title>

        {/* track */}
        <circle
          cx={c}
          cy={c}
          r={radius}
          fill="none"
          className="stroke-surface-2"
          strokeWidth={thickness}
        />

        {total > 0 &&
          (() => {
            // A hairline of surface between adjacent arcs (~2px of the ~465px
            // circumference) so neighbouring fills never touch; skipped when a
            // single slice owns the whole ring.
            const visible = arcs.filter((a) => a.frac > 0);
            const gap = visible.length > 1 ? 0.5 : 0;
            return visible.map(({ slice, i, frac, start, stroke }) => {
              const pct = frac * 100;
              const dash = Math.max(pct - gap, 0.4);
              return (
                <circle
                  key={`${slice.label}-${i}`}
                  cx={c}
                  cy={c}
                  r={radius}
                  fill="none"
                  className={stroke}
                  strokeWidth={thickness}
                  strokeLinecap="butt"
                  pathLength={100}
                  strokeDasharray={`${dash} ${100 - dash}`}
                  transform={`rotate(${-90 + (start + gap / 200) * 360} ${c} ${c})`}
                >
                  <title>{`${slice.label}: ${slice.value} (${Math.round(pct)}%)`}</title>
                </circle>
              );
            });
          })()}

        {/* center readout */}
        <text
          x={c}
          y={c - 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="data fill-ink"
          fontSize={size * 0.19}
          fontWeight={600}
        >
          {center}
        </text>
        {centerLabel != null && (
          <text
            x={c}
            y={c + size * 0.13}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-ink-faint"
            fontSize={size * 0.072}
          >
            {centerLabel}
          </text>
        )}
      </svg>

      {legend && data.length > 0 && (
        <ul className="flex min-w-0 flex-col gap-1.5">
          {arcs.map(({ slice, i, frac, bg }) => (
            <li key={`${slice.label}-${i}`} className="flex items-center gap-2 text-xs">
              <span className={cn("h-2 w-2 shrink-0 rounded-[2px]", bg)} aria-hidden />
              <span className="truncate text-ink-muted">{slice.label}</span>
              <span className="data ml-auto pl-3 text-ink">{slice.value}</span>
              <span className="data w-9 text-right text-ink-faint">
                {total > 0 ? `${Math.round(frac * 100)}%` : "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
