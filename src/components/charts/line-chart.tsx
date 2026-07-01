"use client";

/**
 * LineChart — a time-series instrument: hairline axes, faint gridlines, one or
 * more hairline series, and a pointer-driven crosshair + tooltip that reads the
 * value at the nearest sample. Series share the `x` axis (aligned samples). The
 * only client component in the kit — everything else renders on the server.
 */
import * as React from "react";
import { cn } from "@/lib/cn";
import {
  type ChartTone,
  toneStroke,
  toneFill,
  toneBg,
  formatCompact,
  linePath,
  niceCeil,
  clamp,
  scaleLinear,
} from "./shared";

export interface LineChartSeries {
  /** Legend / tooltip name for the series. */
  label: string;
  /** Y values, aligned index-for-index with the shared `x` array. */
  data: number[];
  tone?: ChartTone;
  /** Fill the area beneath this series. */
  area?: boolean;
}

export interface LineChartProps {
  /** Shared x axis values (e.g. epoch-ms timestamps), one per sample. */
  x: number[];
  series: LineChartSeries[];
  /** Format an x value for axis ticks + tooltip (default: compact number). */
  xFormat?: (x: number) => string;
  /** Format a y value for axis ticks + tooltip (default: compact number). */
  yFormat?: (y: number) => string;
  /** Anchor the y axis at zero for non-negative data (default true). */
  zeroBaseline?: boolean;
  className?: string;
  "aria-label"?: string;
}

const VW = 760;
const VH = 260;
const M = { top: 16, right: 16, bottom: 26, left: 40 };
const SERIES_TONES: ChartTone[] = ["beacon", "online", "warn", "critical", "neutral"];

export function LineChart({
  x,
  series,
  xFormat = formatCompact,
  yFormat = formatCompact,
  zeroBaseline = true,
  className,
  "aria-label": ariaLabel,
}: LineChartProps) {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [hover, setHover] = React.useState<number | null>(null);

  const n = x.length;
  const values = series.flatMap((s) => s.data);
  const empty = n < 2 || values.length === 0;

  // --- scales ---------------------------------------------------------------
  const rawMin = empty ? 0 : Math.min(...values);
  const rawMax = empty ? 1 : Math.max(...values);
  const zeroed = zeroBaseline && rawMin >= 0;
  const yLo = zeroed ? 0 : rawMin;
  const yHiRaw = zeroed ? niceCeil(rawMax) || 1 : rawMax;
  const yHi = yHiRaw === yLo ? yLo + 1 : yHiRaw;

  const xScale = scaleLinear(
    [empty ? 0 : Math.min(...x), empty ? 1 : Math.max(...x)],
    [M.left, VW - M.right],
  );
  const yScale = scaleLinear([yLo, yHi], [VH - M.bottom, M.top]);

  const xPos = x.map((v) => xScale(v));
  const yTicks = [yLo, (yLo + yHi) / 2, yHi];
  const xTickIdx = n > 1 ? [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (n - 1))) : [];

  // --- pointer → nearest sample --------------------------------------------
  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (empty || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const ux = ((e.clientX - rect.left) / rect.width) * VW;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < xPos.length; i++) {
      const d = Math.abs(xPos[i] - ux);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHover(best);
  }

  const label =
    ariaLabel ??
    `Time series: ${series.map((s) => s.label).join(", ")} across ${n} samples`;

  const hi = hover != null && !empty ? clamp(hover, 0, n - 1) : null;
  const tipFrac = hi != null ? xPos[hi] / VW : 0;

  return (
    <div className={cn("relative w-full", className)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        role="img"
        aria-label={label}
        className="block h-auto w-full touch-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <title>{label}</title>

        {/* y gridlines + labels */}
        {yTicks.map((t, i) => {
          const gy = yScale(t);
          return (
            <g key={`y${i}`}>
              <line
                x1={M.left}
                y1={gy}
                x2={VW - M.right}
                y2={gy}
                className="stroke-line"
                strokeOpacity={i === 0 ? 1 : 0.5}
                strokeWidth={1}
              />
              <text
                x={M.left - 6}
                y={gy}
                textAnchor="end"
                dominantBaseline="central"
                className="data fill-ink-faint"
                fontSize={10}
              >
                {yFormat(t)}
              </text>
            </g>
          );
        })}

        {/* x axis ticks + labels */}
        {xTickIdx.map((idx, i) => {
          const gx = xPos[idx];
          const anchor = i === 0 ? "start" : i === xTickIdx.length - 1 ? "end" : "middle";
          return (
            <text
              key={`x${i}`}
              x={gx}
              y={VH - 8}
              textAnchor={anchor}
              className="data fill-ink-faint"
              fontSize={10}
            >
              {xFormat(x[idx])}
            </text>
          );
        })}

        {empty ? (
          <text
            x={VW / 2}
            y={VH / 2}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-ink-faint"
            fontSize={12}
          >
            Not enough data
          </text>
        ) : (
          series.map((s, si) => {
            const tone = s.tone ?? SERIES_TONES[si % SERIES_TONES.length];
            const pts = s.data.map((v, i) => [xPos[i], yScale(v)] as const);
            const d = linePath(pts);
            const base = yScale(yLo);
            return (
              <g key={s.label}>
                {s.area && (
                  <path
                    d={`${d} L${pts[pts.length - 1][0].toFixed(2)} ${base.toFixed(2)} L${pts[0][0].toFixed(2)} ${base.toFixed(2)} Z`}
                    className={toneFill[tone]}
                    fillOpacity={0.1}
                  />
                )}
                <path
                  d={d}
                  fill="none"
                  className={toneStroke[tone]}
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          })
        )}

        {/* crosshair + focus dots */}
        {hi != null && (
          <g>
            <line
              x1={xPos[hi]}
              y1={M.top}
              x2={xPos[hi]}
              y2={VH - M.bottom}
              className="stroke-line-strong"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            {series.map((s, si) => {
              const tone = s.tone ?? SERIES_TONES[si % SERIES_TONES.length];
              return (
                <circle
                  key={s.label}
                  cx={xPos[hi]}
                  cy={yScale(s.data[hi])}
                  r={3.5}
                  className={cn(toneFill[tone], "stroke-surface")}
                  strokeWidth={1.5}
                />
              );
            })}
          </g>
        )}
      </svg>

      {/* tooltip — HTML overlay positioned by the sample's x fraction */}
      {hi != null && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-28 -translate-x-1/2 rounded-control border border-line-strong bg-surface-2 px-2 py-1.5 shadow-lg shadow-graphite-950/30"
          style={{
            left: `${clamp(tipFrac * 100, 12, 88)}%`,
          }}
        >
          <div className="data mb-1 text-[11px] text-ink-muted">{xFormat(x[hi])}</div>
          <ul className="flex flex-col gap-0.5">
            {series.map((s, si) => {
              const tone = s.tone ?? SERIES_TONES[si % SERIES_TONES.length];
              return (
                <li key={s.label} className="flex items-center gap-1.5 text-xs">
                  <span className={cn("h-1.5 w-1.5 rounded-full", toneBg[tone])} />
                  <span className="text-ink-muted">{s.label}</span>
                  <span className="data ml-auto pl-2 text-ink">{yFormat(s.data[hi])}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
