/**
 * BarChart — count bars with value labels, vertical or horizontal. Vertical
 * suits a handful of categories (labels sit under each bar); horizontal scales
 * to longer lists and long labels (label + value ride above each bar, so text
 * never collides with the geometry). Bars sit on a faint track; hairline
 * baseline. Pure SVG, server-renderable, tokens throughout.
 */
import * as React from "react";
import { cn } from "@/lib/cn";
import { type ChartTone, toneFill, formatCompact, niceCeil } from "./shared";

export interface BarDatum {
  label: string;
  value: number;
  tone?: ChartTone;
}

export interface BarChartProps {
  data: BarDatum[];
  orientation?: "vertical" | "horizontal";
  /** Domain max (defaults to a nice bound above the largest value). */
  max?: number;
  /** Default bar tone when a datum has none. */
  tone?: ChartTone;
  /** Format the value label (default: compact number). */
  valueFormat?: (v: number) => string;
  /** Show numeric value labels (default true). */
  showValues?: boolean;
  className?: string;
  "aria-label"?: string;
}

export function BarChart(props: BarChartProps) {
  const { orientation = "vertical" } = props;
  return orientation === "vertical" ? (
    <VerticalBars {...props} />
  ) : (
    <HorizontalBars {...props} />
  );
}

function domainMax(data: BarDatum[], max?: number): number {
  if (max != null) return max || 1;
  return niceCeil(Math.max(0, ...data.map((d) => d.value))) || 1;
}

function ariaSummary(data: BarDatum[], override?: string): string {
  return (
    override ??
    `Bar chart: ${data.map((d) => `${d.label} ${d.value}`).join(", ") || "no data"}`
  );
}

// -- vertical ----------------------------------------------------------------

const V = { w: 480, h: 240, top: 18, bottom: 30, left: 6, right: 6 };

function VerticalBars({
  data,
  max,
  tone = "beacon",
  valueFormat = formatCompact,
  showValues = true,
  className,
  "aria-label": ariaLabel,
}: BarChartProps) {
  const top = domainMax(data, max);
  const plotH = V.h - V.top - V.bottom;
  const plotW = V.w - V.left - V.right;
  const band = data.length > 0 ? plotW / data.length : plotW;
  const barW = Math.min(band * 0.6, 56);
  const baseY = V.h - V.bottom;
  const label = ariaSummary(data, ariaLabel);

  return (
    <svg
      viewBox={`0 0 ${V.w} ${V.h}`}
      role="img"
      aria-label={label}
      className={cn("block h-auto w-full", className)}
    >
      <title>{label}</title>

      {/* gridlines */}
      {[0, 0.5, 1].map((f, i) => {
        const gy = baseY - f * plotH;
        return (
          <line
            key={f}
            x1={V.left}
            y1={gy}
            x2={V.w - V.right}
            y2={gy}
            className={i === 0 ? "stroke-line-strong" : "stroke-line"}
            strokeOpacity={i === 0 ? 1 : 0.5}
            strokeWidth={1}
          />
        );
      })}

      {data.map((d, i) => {
        const cx = V.left + band * (i + 0.5);
        const h = top > 0 ? (Math.max(d.value, 0) / top) * plotH : 0;
        const y = baseY - h;
        return (
          <g key={`${d.label}-${i}`}>
            {/* track */}
            <rect
              x={cx - barW / 2}
              y={V.top}
              width={barW}
              height={plotH}
              rx={3}
              className="fill-surface-2"
              opacity={0.6}
            />
            <rect
              x={cx - barW / 2}
              y={y}
              width={barW}
              height={h}
              rx={3}
              className={toneFill[d.tone ?? tone]}
            >
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
            {showValues && (
              <text
                x={cx}
                y={y - 6}
                textAnchor="middle"
                className="data fill-ink"
                fontSize={11}
              >
                {valueFormat(d.value)}
              </text>
            )}
            <text
              x={cx}
              y={V.h - 10}
              textAnchor="middle"
              className="fill-ink-faint"
              fontSize={11}
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// -- horizontal --------------------------------------------------------------

const H = { w: 480, rowH: 34, barH: 12, top: 6, bottom: 4, left: 2, right: 2 };

function HorizontalBars({
  data,
  max,
  tone = "beacon",
  valueFormat = formatCompact,
  showValues = true,
  className,
  "aria-label": ariaLabel,
}: BarChartProps) {
  const top = domainMax(data, max);
  const height = H.top + H.bottom + data.length * H.rowH;
  const trackW = H.w - H.left - H.right;
  const label = ariaSummary(data, ariaLabel);

  return (
    <svg
      viewBox={`0 0 ${H.w} ${Math.max(height, H.rowH)}`}
      role="img"
      aria-label={label}
      className={cn("block h-auto w-full", className)}
    >
      <title>{label}</title>

      {data.map((d, i) => {
        const y0 = H.top + i * H.rowH;
        const barY = y0 + 15;
        const w = top > 0 ? (Math.max(d.value, 0) / top) * trackW : 0;
        return (
          <g key={`${d.label}-${i}`}>
            <text x={H.left} y={y0 + 9} className="fill-ink-muted" fontSize={11}>
              {d.label}
            </text>
            {showValues && (
              <text
                x={H.w - H.right}
                y={y0 + 9}
                textAnchor="end"
                className="data fill-ink"
                fontSize={11}
              >
                {valueFormat(d.value)}
              </text>
            )}
            {/* track */}
            <rect
              x={H.left}
              y={barY}
              width={trackW}
              height={H.barH}
              rx={3}
              className="fill-surface-2"
              opacity={0.6}
            />
            <rect
              x={H.left}
              y={barY}
              width={w}
              height={H.barH}
              rx={3}
              className={toneFill[d.tone ?? tone]}
            >
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}
