/**
 * Timeline — events plotted on a horizontal time axis (e.g. key expiries,
 * registrations). Each event is a stem + dot off a hairline axis, labels
 * alternating above/below to reduce collisions, with date ticks along the
 * bottom and an optional "now" marker. Pure SVG, server-renderable, tokens
 * throughout; colour each event via `tone` (e.g. critical for expired).
 */
import * as React from "react";
import { cn } from "@/lib/cn";
import { type ChartTone, toneFill, toneStroke, clamp, scaleLinear } from "./shared";

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
  /** Number of axis ticks (default 5). */
  ticks?: number;
  className?: string;
  "aria-label"?: string;
}

const VW = 760;
const VH = 150;
const AXIS_Y = 78;
const PAD = 40;

function defaultFormat(t: number): string {
  return new Date(t).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function Timeline({
  events,
  start,
  end,
  now,
  formatTime = defaultFormat,
  ticks = 5,
  className,
  "aria-label": ariaLabel,
}: TimelineProps) {
  const sorted = [...events].sort((a, b) => a.time - b.time);
  const times = sorted.map((e) => e.time);
  const lo = start ?? (times.length ? Math.min(...times) : 0);
  const hi = end ?? (times.length ? Math.max(...times) : 1);
  const span = hi - lo || 1;
  const x = scaleLinear([lo, hi === lo ? lo + 1 : hi], [PAD, VW - PAD]);

  const label =
    ariaLabel ??
    (sorted.length
      ? `Timeline: ${sorted.length} events from ${formatTime(lo)} to ${formatTime(hi)}`
      : "Timeline: no events");

  const tickTimes = Array.from({ length: ticks }, (_, i) =>
    lo + (span * i) / Math.max(ticks - 1, 1),
  );

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      role="img"
      aria-label={label}
      className={cn("block h-auto w-full", className)}
    >
      <title>{label}</title>

      {/* axis */}
      <line
        x1={PAD}
        y1={AXIS_Y}
        x2={VW - PAD}
        y2={AXIS_Y}
        className="stroke-line-strong"
        strokeWidth={1}
      />

      {/* ticks */}
      {sorted.length > 0 &&
        tickTimes.map((t, i) => {
          const gx = x(t);
          const anchor = i === 0 ? "start" : i === tickTimes.length - 1 ? "end" : "middle";
          return (
            <g key={`tick-${i}`}>
              <line
                x1={gx}
                y1={AXIS_Y}
                x2={gx}
                y2={AXIS_Y + 5}
                className="stroke-line"
                strokeWidth={1}
              />
              <text
                x={gx}
                y={AXIS_Y + 18}
                textAnchor={anchor}
                className="data fill-ink-faint"
                fontSize={10}
              >
                {formatTime(t)}
              </text>
            </g>
          );
        })}

      {/* now marker */}
      {now != null && now >= lo && now <= hi && (
        <g>
          <line
            x1={x(now)}
            y1={16}
            x2={x(now)}
            y2={AXIS_Y}
            className="stroke-beacon-500"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <text
            x={clamp(x(now), PAD, VW - PAD)}
            y={12}
            textAnchor="middle"
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
          y={AXIS_Y - 20}
          textAnchor="middle"
          className="fill-ink-faint"
          fontSize={12}
        >
          No events
        </text>
      ) : (
        sorted.map((ev, i) => {
          const gx = x(ev.time);
          const above = i % 2 === 0;
          const tone = ev.tone ?? "neutral";
          const dotY = above ? AXIS_Y - 22 : AXIS_Y + 22;
          const labelY = above ? AXIS_Y - 30 : AXIS_Y + 36;
          const anchor =
            gx < PAD + 40 ? "start" : gx > VW - PAD - 40 ? "end" : "middle";
          return (
            <g key={ev.id ?? `${ev.label}-${i}`}>
              <line
                x1={gx}
                y1={AXIS_Y}
                x2={gx}
                y2={dotY}
                className="stroke-line-strong"
                strokeWidth={1}
              />
              <circle
                cx={gx}
                cy={AXIS_Y}
                r={2.5}
                className={cn(toneStroke[tone], "fill-surface")}
                strokeWidth={1.5}
              />
              <circle cx={gx} cy={dotY} r={4} className={toneFill[tone]}>
                <title>{`${ev.label} · ${formatTime(ev.time)}${ev.detail ? ` · ${ev.detail}` : ""}`}</title>
              </circle>
              <text
                x={clamp(gx, PAD, VW - PAD)}
                y={labelY}
                textAnchor={anchor}
                dominantBaseline="central"
                className="fill-ink-muted"
                fontSize={11}
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
