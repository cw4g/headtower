/**
 * Timeline — events plotted on a horizontal time axis (e.g. key expiries,
 * registrations). Events that render as the same time share one dot with their
 * names stacked beneath it; each group is a stem + dot off a hairline axis, with
 * dates along the bottom and an optional "now" marker. Pure SVG,
 * server-renderable, tokens throughout; colour each event via `tone`.
 *
 * The axis is SEGMENTED: long empty stretches are compressed into marked breaks
 * so clusters keep their width, and the breaks - not the spans - soak up any
 * spare width. See ./timeline-scale for the measurements behind that.
 */
import * as React from "react";
import { cn } from "@/lib/cn";
import { type ChartTone, toneFill, toneStroke, r2 } from "./shared";
import {
  estimateTextWidth,
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
  /** Axis start (epoch-ms). Defaults to the events plus the "now" marker. */
  start?: number;
  /** Axis end (epoch-ms). Defaults to the events plus the "now" marker. */
  end?: number;
  /** Draw a "now" marker at this epoch-ms. */
  now?: number;
  /**
   * Format a time for ticks, titles AND grouping (default: short month/day).
   * Events this function cannot tell apart share a dot - see `groups` below.
   */
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
/** Dot to the centre of its first label. */
const LABEL_GAP = 10;
/** Bottom band holding the date ticks. */
const TICK_H = 20;
const LABEL_SIZE = 11;
const TICK_SIZE = 10;
/** Breathing room budgeted per group when sizing a span. */
const LABEL_PAD = 12;
/** Names shown for one group before the rest are summarised. */
const MAX_NAMES = 3;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Worst-first, so a group takes the colour of its most urgent member. */
const SEVERITY: ChartTone[] = ["critical", "warn", "online", "beacon", "neutral"];

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

/** Events that render as the same time, drawn as a single point. */
interface EventGroup {
  key: string;
  /** Position of the group: the earliest time in it. */
  time: number;
  events: TimelineEvent[];
  /** Label rows: names, plus a summary row when there are more than MAX_NAMES. */
  lines: string[];
  tone: ChartTone;
}

/**
 * Bundle events whose formatted time is identical.
 *
 * `formatTime` is the granularity the reader actually sees - "Feb 18" for a
 * whole day. Two events the formatter cannot tell apart must not be drawn as
 * two positions: that reads as two different days, and the axis then claims a
 * precision none of its labels show. Grouping also stops sub-day offsets from
 * inflating a cluster's apparent spread.
 */
function groupEvents(sorted: TimelineEvent[], format: (t: number) => string): EventGroup[] {
  const groups: EventGroup[] = [];
  for (const event of sorted) {
    const key = format(event.time);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.events.push(event);
    else groups.push({ key, time: event.time, events: [event], lines: [], tone: "neutral" });
  }
  for (const group of groups) {
    const names = group.events.map((e) => e.label);
    group.lines =
      names.length > MAX_NAMES
        ? [...names.slice(0, MAX_NAMES), `+${names.length - MAX_NAMES} more`]
        : names;
    group.tone =
      SEVERITY.find((tone) => group.events.some((e) => (e.tone ?? "neutral") === tone)) ??
      "neutral";
  }
  return groups;
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
  const groups = groupEvents(sorted, formatTime);
  const groupWidth = (group: EventGroup) =>
    Math.max(...group.lines.map((line) => estimateTextWidth(line, LABEL_SIZE)), 0);

  // "now" is a significant time too: without it a marker sitting far from every
  // event would be swallowed by a break instead of anchoring one end of it.
  const marks = now != null ? [...groups.map((g) => g.time), now] : groups.map((g) => g.time);

  // The default domain spans the events AND the marker, so a caller never has
  // to pad the axis to keep "now" in frame - the frame margin is a coordinate
  // concern (PAD + spanMargin) and edge labels anchor inwards. Time padding is
  // actively harmful on a segmented axis: inside a narrow span the local scale
  // is steep, so one day of padding measured 278 of 680 units, 41% of the chart.
  const lo = start ?? (marks.length ? Math.min(...marks) : 0);
  const hi = end ?? (marks.length ? Math.max(...marks) : 1);
  const scale = segmentedTimeScale(marks, [lo, hi], [PAD, VW - PAD], {
    // Width follows the labels a span must fit, not how long it lasts, and the
    // breaks absorb the remainder -- see ./timeline-scale for the measurements
    // that forced both halves of that rule.
    spanWeight: (from, to) => {
      const inside = groups.filter((g) => g.time >= from && g.time <= to);
      const content = inside.reduce((total, g) => total + groupWidth(g) + LABEL_PAD, 0);
      // The "now" caption needs room in whichever span it lands in, even though
      // it is a marker rather than an event.
      const marker =
        now != null && now >= from && now <= to
          ? estimateTextWidth("now", 10) + LABEL_PAD
          : 0;
      return content + marker;
    },
  });

  const label =
    ariaLabel ??
    (sorted.length
      ? `Timeline: ${sorted.length} events from ${formatTime(lo)} to ${formatTime(hi)}`
      : "Timeline: no events");

  const { placements, rowsAbove, rowsBelow } = placeLabels(groups, {
    x: (g) => scale.at(g.time),
    width: groupWidth,
    rowSpan: (g) => g.lines.length,
    bounds: [PAD, VW - PAD],
  });

  // The frame grows with the rows actually used, so packing can never clip.
  const extent = (rows: number) =>
    rows > 0 ? STEM + (rows - 1) * ROW_H + LABEL_GAP + LABEL_SIZE / 2 + 2 : STEM;
  const axisY = NOW_H + extent(rowsAbove);
  const height = axisY + extent(rowsBelow) + TICK_H;

  // A segmented axis is ticked at its boundaries: those are the only times whose
  // position is meaningful across a break. Unbroken axes keep the even spacing.
  const tickTimes = !groups.length
    ? []
    : scale.broken
      ? Array.from(new Set(scale.segments.flatMap((s) => [s.from, s.to]))).sort((a, b) => a - b)
      : Array.from({ length: ticks }, (_, i) => lo + ((hi - lo) * i) / Math.max(ticks - 1, 1));

  const nowX = now != null && now >= lo && now <= hi ? scale.at(now) : null;

  // Thin the ticks so their text cannot collide. A boundary date is worth more
  // than a domain edge: the edges are usually just the caller's padding, while
  // the dates flanking a break say what the break skipped. So offer them in
  // priority order and keep only what fits.
  const tickCandidates = tickTimes.map((t) => {
    const gx = scale.at(t);
    const beforeBreak = scale.gaps.some((g) => g.from === t);
    const afterBreak = scale.gaps.some((g) => g.to === t);
    const anchor: "start" | "middle" | "end" =
      beforeBreak && !afterBreak
        ? "end"
        : afterBreak && !beforeBreak
          ? "start"
          : gx <= PAD + 2
            ? "start"
            : gx >= VW - PAD - 2
              ? "end"
              : "middle";
    const width = estimateTextWidth(formatTime(t), TICK_SIZE);
    const left = anchor === "start" ? gx : anchor === "end" ? gx - width : gx - width / 2;
    return {
      t,
      gx,
      anchor,
      left,
      right: left + width,
      priority: beforeBreak || afterBreak ? 2 : gx <= PAD + 2 || gx >= VW - PAD - 2 ? 0 : 1,
    };
  });

  const keptTicks: typeof tickCandidates = [];
  for (const candidate of [...tickCandidates].sort((a, b) => b.priority - a.priority)) {
    const clashes = keptTicks.some(
      (kept) => candidate.left < kept.right + 3 && kept.left < candidate.right + 3,
    );
    if (!clashes) keptTicks.push(candidate);
  }
  keptTicks.sort((a, b) => a.gx - b.gx);

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
      {keptTicks.map(({ t, gx, anchor }, i) => (
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
      ))}

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

      {groups.length === 0 ? (
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
        placements.map(({ item: group, x: gx, row, side, anchor, textX }) => {
          const dir = side === "above" ? -1 : 1;
          const dotY = axisY + dir * (STEM + row * ROW_H);
          const title = `${group.events.map((e) => e.label).join(", ")} · ${formatTime(group.time)}${
            group.events[0]?.detail ? ` · ${group.events[0].detail}` : ""
          }`;
          return (
            <g key={group.key}>
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
                className={cn(toneStroke[group.tone], "fill-surface")}
                strokeWidth={1.5}
              />
              <circle cx={gx} cy={dotY} r={4} className={toneFill[group.tone]}>
                <title>{title}</title>
              </circle>
              {group.lines.map((line, j) => (
                <text
                  key={line + j}
                  x={textX}
                  y={dotY + dir * (LABEL_GAP + j * ROW_H)}
                  textAnchor={anchor}
                  dominantBaseline="central"
                  className="fill-ink-muted"
                  fontSize={LABEL_SIZE}
                >
                  {line}
                </text>
              ))}
            </g>
          );
        })
      )}
    </svg>
  );
}
