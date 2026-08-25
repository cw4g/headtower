/**
 * Timeline — events plotted on a horizontal time axis (e.g. key expiries,
 * registrations). Each event is a stem + dot off a hairline axis, with its label
 * packed into the nearest free row on either side, dates along the bottom, and
 * an optional "now" marker. Pure SVG, server-renderable, tokens throughout;
 * colour each event via `tone` (e.g. critical for expired).
 *
 * The axis is SEGMENTED: long empty stretches are compressed into marked breaks
 * so clusters keep their width. See ./timeline-scale for why a linear axis
 * cannot serve this data, and for the label packing that replaces fixed
 * above/below alternation.
 */
import * as React from "react";
import { cn } from "@/lib/cn";
import { type ChartTone, toneFill, toneStroke, r2 } from "./shared";
import {
  placeLabels,
  segmentedTimeScale,
  type TimelineSegment,
} from "./timeline-scale";

export interface TimelineEvent {
  id?: string;
  label: string;
  /** Epoch-ms position on the axis. */
  time: number;
  tone?: ChartTone;
  /** Extra text for the accessible `<title>`. */
  detail?: string;
}

export interface TimelineProps {
  events: TimelineEvent[];
  /** Axis start (epoch-ms). Defaults to the earliest event. */
  start?: number;
  /** Axis end (epoch-ms). Defaults to the latest event. */
  end?: number;
  /** Draw a "now" marker at this epoch-ms. */
  now?: number;
  /** Format a time for ticks + titles (default: short month/day). */
  formatTime?: (t: number) => string;
  /**
   * Number of axis ticks (default 5). Applies only when the axis ends up
   * unbroken; a segmented axis is ticked at its segment boundaries instead,
   * because evenly spaced ticks would sit at times the axis does not linearly
   * represent.
   */
  ticks?: number;
  /** Format the duration a break stands for (default: "174 d" / "2 y"). */
  formatGap?: (ms: number) => string;
  className?: string;
  "aria-label"?: string;
}

const VW = 760;
const PAD = 40;
/** Headroom for the "now" caption above everything else. */
const NOW_H = 16;
/** Axis to the innermost dot. */
const STEM = 18;
/** Extra distance for each row further out. */
const ROW_H = 15;
/** Dot to the centre of its label. */
const LABEL_GAP = 10;
/** Bottom band holding the date ticks. */
const TICK_H = 20;
const LABEL_SIZE = 11;
const TICK_SIZE = 10;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function defaultFormat(t: number): string {
  return new Date(t).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Compact duration for a break caption: the unit that keeps it legible. */
function defaultFormatGap(ms: number): string {
  const days = ms / DAY;
  if (days >= 730) return `${Math.round(days / 365)} y`;
  if (days >= 60) return `${Math.round(days / 30)} mo`;
  if (days >= 2) return `${Math.round(days)} d`;
  const hours = ms / HOUR;
  if (hours >= 2) return `${Math.round(hours)} h`;
  return `${Math.max(1, Math.round(ms / MINUTE))} min`;
}

/** Zigzag across the axis, standing for the time the break skips. */
function breakGlyph(gap: TimelineSegment, y: number): string {
  const mid = (gap.x0 + gap.x1) / 2;
  const w = 5;
  const h = 4;
  return [
    `M${r2(gap.x0)} ${r2(y)}`,
    `L${r2(mid - w)} ${r2(y)}`,
    `L${r2(mid - w / 2)} ${r2(y - h)}`,
    `L${r2(mid + w / 2)} ${r2(y + h)}`,
    `L${r2(mid + w)} ${r2(y)}`,
    `L${r2(gap.x1)} ${r2(y)}`,
  ].join(" ");
}

export function Timeline({
  events,
  start,
  end,
  now,
  formatTime = defaultFormat,
  ticks = 5,
  formatGap = defaultFormatGap,
  className,
  "aria-label": ariaLabel,
}: TimelineProps) {
  const sorted = [...events].sort((a, b) => a.time - b.time);
  const times = sorted.map((e) => e.time);
  const lo = start ?? (times.length ? Math.min(...times) : 0);
  const hi = end ?? (times.length ? Math.max(...times) : 1);

  // "now" is a significant time too: without it a marker sitting far from every
  // event would be swallowed by a break instead of anchoring one end of it.
  const marks = now != null ? [...times, now] : times;
  const scale = segmentedTimeScale(marks, [lo, hi], [PAD, VW - PAD]);

  const label =
    ariaLabel ??
    (sorted.length
      ? `Timeline: ${sorted.length} events from ${formatTime(lo)} to ${formatTime(hi)}`
      : "Timeline: no events");

  const { placements, rowsAbove, rowsBelow } = placeLabels(sorted, {
    x: (e) => scale.at(e.time),
    label: (e) => e.label,
    fontSize: LABEL_SIZE,
    bounds: [PAD, VW - PAD],
  });

  // The frame grows with the rows actually used, so packing can never clip.
  const extent = (rows: number) =>
    rows > 0 ? STEM + (rows - 1) * ROW_H + LABEL_GAP + LABEL_SIZE / 2 + 2 : STEM;
  const axisY = NOW_H + extent(rowsAbove);
  const height = axisY + extent(rowsBelow) + TICK_H;

  // A segmented axis is ticked at its boundaries: those are the only times whose
  // position is meaningful across a break. Unbroken axes keep the even spacing.
  const tickTimes = !sorted.length
    ? []
    : scale.broken
      ? Array.from(new Set(scale.segments.flatMap((s) => [s.from, s.to]))).sort((a, b) => a - b)
      : Array.from({ length: ticks }, (_, i) => lo + ((hi - lo) * i) / Math.max(ticks - 1, 1));

  const nowX = now != null && now >= lo && now <= hi ? scale.at(now) : null;

  return (
    <svg
      viewBox={`0 0 ${VW} ${r2(height)}`}
      role="img"
      aria-label={label}
      className={cn("block h-auto w-full", className)}
    >
      <title>{label}</title>

      {/* axis */}
      <line
        x1={PAD}
        y1={axisY}
        x2={VW - PAD}
        y2={axisY}
        className="stroke-line-strong"
        strokeWidth={1}
      />

      {/* breaks: the axis is cut here, and the caption says by how much */}
      {scale.gaps.map((gap, i) => (
        <g key={`gap-${i}`}>
          {/* Blank the axis under the glyph so the hairline does not show through. */}
          <line
            x1={gap.x0}
            y1={axisY}
            x2={gap.x1}
            y2={axisY}
            className="stroke-surface"
            strokeWidth={3}
          />
          <path
            d={breakGlyph(gap, axisY)}
            className="stroke-line-strong"
            strokeWidth={1}
            fill="none"
          />
          {/* Safe to sit just above the axis: a break spans empty time, so no
              stem or dot can be inside its x range. */}
          <text
            x={(gap.x0 + gap.x1) / 2}
            y={axisY - 7}
            textAnchor="middle"
            className="data fill-ink-faint"
            fontSize={8}
          >
            {formatGap(gap.to - gap.from)}
          </text>
        </g>
      ))}

      {/* date ticks, in their own band at the bottom so they cannot interleave
          with the event rows the way a row directly under the axis did */}
      {tickTimes.map((t, i) => {
        const gx = scale.at(t);
        // The dates flanking a break are only `gapWidth` apart while each is
        // several times that wide, so centring both guarantees an overlap
        // (measured: 13px). Anchor them away from the break instead - the one
        // before it ends at the seam, the one after it starts there.
        const beforeBreak = scale.gaps.some((g) => g.from === t);
        const afterBreak = scale.gaps.some((g) => g.to === t);
        const anchor =
          beforeBreak && !afterBreak
            ? "end"
            : afterBreak && !beforeBreak
              ? "start"
              : gx <= PAD + 2
                ? "start"
                : gx >= VW - PAD - 2
                  ? "end"
                  : "middle";
        return (
          <g key={`tick-${i}`}>
            <line
              x1={gx}
              y1={axisY - 3}
              x2={gx}
              y2={axisY + 3}
              className="stroke-line"
              strokeWidth={1}
            />
            <text
              x={gx}
              y={height - 6}
              textAnchor={anchor}
              className="data fill-ink-faint"
              fontSize={TICK_SIZE}
            >
              {formatTime(t)}
            </text>
          </g>
        );
      })}

      {/* now marker */}
      {nowX != null && (
        <g>
          <line
            x1={nowX}
            y1={NOW_H}
            x2={nowX}
            y2={axisY}
            className="stroke-beacon-500"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <text
            x={nowX}
            y={NOW_H - 6}
            textAnchor={nowX <= PAD + 12 ? "start" : nowX >= VW - PAD - 12 ? "end" : "middle"}
            className="data fill-beacon-500"
            fontSize={10}
          >
            now
          </text>
        </g>
      )}

      {sorted.length === 0 ? (
        <text
          x={VW / 2}
          y={axisY - 20}
          textAnchor="middle"
          className="fill-ink-faint"
          fontSize={12}
        >
          No events
        </text>
      ) : (
        placements.map(({ item: ev, x: gx, row, side, anchor, textX }, i) => {
          const tone = ev.tone ?? "neutral";
          const dir = side === "above" ? -1 : 1;
          const dotY = axisY + dir * (STEM + row * ROW_H);
          const labelY = dotY + dir * LABEL_GAP;
          return (
            <g key={ev.id ?? `${ev.label}-${i}`}>
              <line
                x1={gx}
                y1={axisY}
                x2={gx}
                y2={dotY}
                className="stroke-line-strong"
                strokeWidth={1}
              />
              <circle
                cx={gx}
                cy={axisY}
                r={2.5}
                className={cn(toneStroke[tone], "fill-surface")}
                strokeWidth={1.5}
              />
              <circle cx={gx} cy={dotY} r={4} className={toneFill[tone]}>
                <title>{`${ev.label} · ${formatTime(ev.time)}${ev.detail ? ` · ${ev.detail}` : ""}`}</title>
              </circle>
              {/* A label pushed off its dot by packing gets a short connector so
                  it stays obvious which dot it belongs to. */}
              {Math.abs(textX - gx) > 2 && (
                <line
                  x1={gx}
                  y1={dotY + dir * 4}
                  x2={textX}
                  y2={labelY - dir * 2}
                  className="stroke-line"
                  strokeWidth={0.75}
                />
              )}
              <text
                x={textX}
                y={labelY}
                textAnchor={anchor}
                dominantBaseline="central"
                className="fill-ink-muted"
                fontSize={LABEL_SIZE}
              >
                {ev.label}
              </text>
            </g>
          );
        })
      )}
    </svg>
  );
}
