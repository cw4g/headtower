"use client";

/**
 * LineChart — a time-series instrument: hairline axes, faint gridlines, one or
 * more hairline series, and a pointer-driven crosshair + tooltip that reads the
 * value at the nearest sample. Series share the `x` axis (aligned samples). The
 * only client component in the kit — everything else renders on the server.
 *
 * A `null` in a series means "nothing was observed here", and it is drawn as a
 * BREAK rather than interpolated across. That distinction is the difference
 * between a chart of observations and a chart that invents them: measured on a
 * real instance, one straight segment spanned 396 of 704 units across 2.8 days
 * in which nothing had been measured. See ./series for the bucketing that turns
 * irregular samples into an even grid with explicit holes.
 */
import * as React from "react";
import { cn } from "@/lib/cn";
import {
  type ChartTone,
  toneStroke,
  toneFill,
  toneBg,
  estimateTextWidth,
  formatCompact,
  linePath,
  stepPath,
  niceCeil,
  clamp,
  scaleLinear,
} from "./shared";
import { runsOfPresent, timeTicks } from "./series";

export interface LineChartSeries {
  /** Legend / tooltip name for the series. */
  label: string;
  /** Y values, aligned index-for-index with `x`. `null` = not observed. */
  data: Array<number | null>;
  tone?: ChartTone;
  /** Fill the area beneath this series. */
  area?: boolean;
  /**
   * How to join consecutive samples. Defaults to `"linear"` so existing callers
   * are unaffected, but `"step"` is the honest choice for anything counted:
   * see `stepPath` in ./shared for why a diagonal between two integer readings
   * draws values that cannot exist.
   */
  curve?: "linear" | "step";
}

export interface LineChartProps {
  /** Shared x axis values (e.g. epoch-ms timestamps), one per sample. */
  x: number[];
  series: LineChartSeries[];
  /** Format an x value for the tooltip (default: compact number). */
  xFormat?: (x: number) => string;
  /**
   * Build an axis-label formatter once the tick spacing is known.
   *
   * Axis labels need a different granularity from the tooltip: the tooltip names
   * one sample and can afford to be precise, while a tick only has to be
   * distinguishable from its neighbours. Choosing by SPAN instead put two ticks
   * five hours apart under the identical label "Aug 24", overlapping by a pixel.
   */
  xTickFormat?: (spacingMs: number, spanMs: number) => (x: number) => string;
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
const TICK_SIZE = 10;
/** Preferred axis ticks, reduced when their labels would not fit. */
const TICK_TARGET = 5;
const TICK_MIN = 3;

export function LineChart({
  x,
  series,
  xFormat = formatCompact,
  xTickFormat,
  yFormat = formatCompact,
  zeroBaseline = true,
  className,
  "aria-label": ariaLabel,
}: LineChartProps) {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [hover, setHover] = React.useState<number | null>(null);

  const n = x.length;
  const values = series.flatMap((s) => s.data).filter((v): v is number => v != null);
  const empty = n < 2 || values.length === 0;

  // --- scales ---------------------------------------------------------------
  const rawMin = empty ? 0 : Math.min(...values);
  const rawMax = empty ? 1 : Math.max(...values);
  const zeroed = zeroBaseline && rawMin >= 0;
  const yLo = zeroed ? 0 : rawMin;
  const yHiRaw = zeroed ? niceCeil(rawMax) || 1 : rawMax;
  const yHi = yHiRaw === yLo ? yLo + 1 : yHiRaw;

  const xLo = empty ? 0 : Math.min(...x);
  const xHi = empty ? 1 : Math.max(...x);
  const xScale = scaleLinear([xLo, xHi], [M.left, VW - M.right]);
  const yScale = scaleLinear([yLo, yHi], [VH - M.bottom, M.top]);

  const xPos = x.map((v) => xScale(v));
  const yTicks = [yLo, (yLo + yHi) / 2, yHi];

  // --- x ticks: chosen by TIME, not by sample index -------------------------
  // Index-based ticks (every quarter of the samples) are only meaningful when
  // samples are evenly spaced in time, and they were not: the old chart put
  // ticks at samples 0, 7, 14, 20, 27, landing 2.8 days apart in one place and
  // 5 hours apart in another.
  const { xTicks, tickFormat } = React.useMemo(() => {
    if (empty) return { xTicks: [] as number[], tickFormat: xFormat };
    const span = xHi - xLo;
    const usable = VW - M.left - M.right;
    // Start at the preferred count and step down while the widest label would
    // not fit its share of the width. One pass suffices: labels only get shorter
    // as ticks move further apart.
    let count = TICK_TARGET;
    let format = xTickFormat ? xTickFormat(span / (count - 1), span) : xFormat;
    for (; count > TICK_MIN; count--) {
      format = xTickFormat ? xTickFormat(span / (count - 1), span) : xFormat;
      const widest = Math.max(
        ...timeTicks(xLo, xHi, count).map((t) => estimateTextWidth(format(t), TICK_SIZE)),
      );
      if (widest + 16 <= usable / count) break;
    }
    return { xTicks: timeTicks(xLo, xHi, count), tickFormat: format };
  }, [empty, xHi, xLo, xFormat, xTickFormat]);

  // --- pointer → nearest OBSERVED sample -----------------------------------
  // Snapping to the nearest bucket regardless of content would let the crosshair
  // land in a hole and report nothing; the nearest reading is what the operator
  // is pointing at.
  const observed = React.useMemo(
    () => x.map((_, i) => i).filter((i) => series.some((s) => s.data[i] != null)),
    [x, series],
  );

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (empty || !svgRef.current || observed.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const ux = ((e.clientX - rect.left) / rect.width) * VW;
    let best = observed[0];
    let bestD = Infinity;
    for (const i of observed) {
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
        {xTicks.map((t, i) => {
          const gx = xScale(t);
          const anchor = i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle";
          return (
            <text
              key={`x${i}`}
              x={gx}
              y={VH - 8}
              textAnchor={anchor}
              className="data fill-ink-faint"
              fontSize={TICK_SIZE}
            >
              {tickFormat(t)}
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
            const base = yScale(yLo);
            // One path per run of observations: the stroke stops where the
            // readings stop instead of ramping across unmeasured time.
            const runs = runsOfPresent(s.data);
            return (
              <g key={s.label}>
                {runs.map((run, ri) => {
                  const pts: Array<readonly [number, number]> = [];
                  for (let i = run.from; i <= run.to; i++) {
                    const v = s.data[i];
                    if (v != null) pts.push([xPos[i], yScale(v)] as const);
                  }
                  if (pts.length === 0) return null;
                  const d = s.curve === "step" ? stepPath(pts) : linePath(pts);
                  return (
                    <g key={`${s.label}-${ri}`}>
                      {s.area && pts.length > 1 && (
                        <path
                          d={`${d} L${pts[pts.length - 1][0].toFixed(2)} ${base.toFixed(2)} L${pts[0][0].toFixed(2)} ${base.toFixed(2)} Z`}
                          className={toneFill[tone]}
                          fillOpacity={0.1}
                        />
                      )}
                      {pts.length === 1 ? (
                        // A lone reading between two gaps: a dot, because a
                        // one-point path draws nothing at all.
                        <circle
                          cx={pts[0][0]}
                          cy={pts[0][1]}
                          r={1.75}
                          className={toneFill[tone]}
                        />
                      ) : (
                        <path
                          d={d}
                          fill="none"
                          className={toneStroke[tone]}
                          strokeWidth={1.75}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}
                    </g>
                  );
                })}
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
              const v = s.data[hi];
              if (v == null) return null;
              const tone = s.tone ?? SERIES_TONES[si % SERIES_TONES.length];
              return (
                <circle
                  key={s.label}
                  cx={xPos[hi]}
                  cy={yScale(v)}
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
              const v = s.data[hi];
              return (
                <li key={s.label} className="flex items-center gap-1.5 text-xs">
                  <span className={cn("h-1.5 w-1.5 rounded-full", toneBg[tone])} />
                  <span className="text-ink-muted">{s.label}</span>
                  <span className="data ml-auto pl-2 text-ink">
                    {v == null ? "—" : yFormat(v)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
