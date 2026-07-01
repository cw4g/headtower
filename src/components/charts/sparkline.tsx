/**
 * Sparkline — an inline trend readout: one hairline path, optional area fill,
 * and a crisp "latest reading" tick. Pure SVG, server-renderable, colours from
 * the design tokens. It stretches to fill its container width (non-scaling
 * strokes keep the line weight constant), so it sits comfortably in a table
 * cell, a stat tile, or a host card.
 */
import * as React from "react";
import { cn } from "@/lib/cn";
import { type ChartTone, toneStroke, toneFill, linePath, r2, scaleLinear } from "./shared";

export interface SparklineProps {
  /** Ordered series values, oldest → newest. */
  data: number[];
  /** viewBox width (coordinate space, not a hard pixel size). */
  width?: number;
  /** viewBox height. */
  height?: number;
  tone?: ChartTone;
  /** Fill the area beneath the line. */
  area?: boolean;
  strokeWidth?: number;
  /** Mark the latest value with a tick. */
  showEnd?: boolean;
  /** Override the value domain (defaults to the data's min/max). */
  min?: number;
  max?: number;
  className?: string;
  /** Accessible `<title>` text; falls back to a generated summary. */
  title?: string;
  "aria-label"?: string;
}

export function Sparkline({
  data,
  width = 120,
  height = 32,
  tone = "beacon",
  area = false,
  strokeWidth = 1.5,
  showEnd = true,
  min,
  max,
  className,
  title,
  "aria-label": ariaLabel,
}: SparklineProps) {
  const pad = strokeWidth + 1.5;
  const label =
    ariaLabel ??
    (data.length
      ? `Trend, ${data.length} points, latest ${data[data.length - 1]}`
      : "No trend data");

  let body: React.ReactNode;
  if (data.length === 0) {
    body = (
      <line
        x1={pad}
        y1={height / 2}
        x2={width - pad}
        y2={height / 2}
        className="stroke-line"
        strokeWidth={1}
        strokeDasharray="2 4"
        vectorEffect="non-scaling-stroke"
      />
    );
  } else {
    const lo = min ?? Math.min(...data);
    const hi = max ?? Math.max(...data);
    const x = scaleLinear([0, Math.max(data.length - 1, 1)], [pad, width - pad]);
    const y = scaleLinear([lo, hi === lo ? lo + 1 : hi], [height - pad, pad]);
    const pts = data.map((v, i) => [x(i), y(v)] as const);
    const d = linePath(pts);
    const base = r2(height - pad);
    const last = pts[pts.length - 1];
    body = (
      <>
        {area && pts.length > 1 && (
          <path
            d={`${d} L${r2(last[0])} ${base} L${r2(pts[0][0])} ${base} Z`}
            className={toneFill[tone]}
            fillOpacity={0.12}
          />
        )}
        <path
          d={d}
          fill="none"
          className={toneStroke[tone]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {showEnd && (
          <line
            x1={r2(last[0])}
            y1={r2(last[1] - 3)}
            x2={r2(last[0])}
            y2={r2(last[1] + 3)}
            className={toneStroke[tone]}
            strokeWidth={strokeWidth + 1}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className={cn("block h-8 w-full", className)}
    >
      <title>{title ?? label}</title>
      {body}
    </svg>
  );
}
