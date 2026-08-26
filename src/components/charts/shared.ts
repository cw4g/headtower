/**
 * Shared internals for the schematic chart kit — tone→class maps, number
 * formatting, and small scale/geometry helpers. Pure and dependency-free so it
 * imports cleanly into both server and client chart components. Every class
 * string is a full literal so Tailwind's scanner keeps them in the build.
 */

/** A functional colour role. `beacon` is the single accent; the rest are status
 *  or neutral. Never use `beacon` to encode status. */
export type ChartTone = "beacon" | "online" | "warn" | "critical" | "neutral";

export const toneStroke: Record<ChartTone, string> = {
  beacon: "stroke-beacon-500",
  online: "stroke-online-500",
  warn: "stroke-warn-500",
  critical: "stroke-critical-500",
  neutral: "stroke-ink-faint",
};

export const toneFill: Record<ChartTone, string> = {
  beacon: "fill-beacon-500",
  online: "fill-online-500",
  warn: "fill-warn-500",
  critical: "fill-critical-500",
  neutral: "fill-ink-faint",
};

export const toneBg: Record<ChartTone, string> = {
  beacon: "bg-beacon-500",
  online: "bg-online-500",
  warn: "bg-warn-500",
  critical: "bg-critical-500",
  neutral: "bg-ink-faint",
};

export const toneText: Record<ChartTone, string> = {
  beacon: "text-beacon-500",
  online: "text-online-600",
  warn: "text-warn-500",
  critical: "text-critical-500",
  neutral: "text-ink-muted",
};

/**
 * Estimate the rendered width of an SVG text label.
 *
 * These charts are server-renderable, so there is no `getComputedTextLength` to
 * ask - a layout has to guess before the browser measures. 0.58em per character
 * is a deliberate slight over-estimate for the console's sans stack:
 * over-estimating spreads labels a little too far, under-estimating lets them
 * touch, and only one of those is a bug.
 */
export function estimateTextWidth(label: string, fontSize: number): number {
  return label.length * fontSize * 0.58 + 4;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function sum(ns: number[]): number {
  let total = 0;
  for (const n of ns) total += n;
  return total;
}

/** Compact, readout-friendly number: 1240 → "1.2k", 18 → "18". */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs < 1000) return String(Math.round(n * 100) / 100);
  const units: [number, string][] = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "k"],
  ];
  for (const [v, s] of units) {
    if (abs >= v) {
      const scaled = n / v;
      const str =
        Math.abs(scaled) >= 100
          ? scaled.toFixed(0)
          : scaled.toFixed(1).replace(/\.0$/, "");
      return str + s;
    }
  }
  return String(n);
}

/** Round up to a "nice" axis bound: 1 / 2 / 2.5 / 5 × 10ⁿ. */
export function niceCeil(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const exp = Math.floor(Math.log10(n));
  const base = 10 ** exp;
  const f = n / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * base;
}

export type Scale = (v: number) => number;

/** Linear map from a data domain onto a coordinate range. */
export function scaleLinear(
  domain: [number, number],
  range: [number, number],
): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** Round to 2dp so generated path `d` strings stay short. */
export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Build an SVG polyline `d` from [x, y] pairs (straight, schematic segments). */
export function linePath(points: ReadonlyArray<readonly [number, number]>): string {
  return points
    .map(([x, y], i) => `${i ? "L" : "M"}${r2(x)} ${r2(y)}`)
    .join(" ");
}

/**
 * Build a STEP path: hold each value until the next sample, then jump.
 *
 * The right shape for a sampled step function, which most things an operator
 * counts are. "Devices online" moves in whole devices at discrete moments; a
 * straight segment from 8 to 9 draws heights like 8.4, and that is not merely
 * unobserved but impossible — the y axis cannot even label it. Holding the last
 * reading claims only "this is the most recent thing we know", and it puts the
 * jump at a definite time instead of smearing it across the interval.
 *
 * Step-AFTER on purpose: the value carries forward from the reading that
 * established it. Stepping before would back-date each change to the start of
 * the preceding interval, asserting it happened earlier than it did.
 *
 * Note this says nothing about UNOBSERVED stretches; those are not drawn at all
 * (see `runsOfPresent` in ./series). Holding a value across a real gap would be
 * the same invention in a different shape.
 */
export function stepPath(points: ReadonlyArray<readonly [number, number]>): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  let d = `M${r2(first[0])} ${r2(first[1])}`;
  let previousY = first[1];
  for (const [x, y] of rest) {
    d += ` L${r2(x)} ${r2(previousY)}`;
    if (y !== previousY) d += ` L${r2(x)} ${r2(y)}`;
    previousY = y;
  }
  return d;
}
