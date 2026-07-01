/**
 * Schematic chart kit — dependency-free, on-brand SVG charts for the operator
 * console. Every chart is responsive via `viewBox`, draws with graphite
 * hairlines + the beacon/status tokens, labels data in `.data` mono, exposes
 * `role="img"` + `<title>`, and honours prefers-reduced-motion through the
 * global motion floor. All server-renderable except LineChart (pointer hover).
 *
 * Shared `tone`: "beacon" (the single accent) | "online" | "warn" | "critical"
 * | "neutral". Never encode status with `beacon`.
 */

// Sparkline — inline trend chip + optional area fill. Fills its container width.
//   <Sparkline data={[3, 5, 4, 8, 7, 11]} tone="online" area />
export { Sparkline } from "./sparkline";
export type { SparklineProps } from "./sparkline";

// LineChart — time-series with hairline axes, hover crosshair + tooltip.
//   <LineChart x={timestamps} series={[{ label: "Online", data: counts }]}
//     xFormat={(t) => new Date(t).toLocaleDateString()} />
export { LineChart } from "./line-chart";
export type { LineChartProps, LineChartSeries } from "./line-chart";

// Donut — distribution ring + center readout + legend. Un-toned slices use a
// quiet graphite ramp; pass `tone` per slice for semantic colours.
//   <Donut data={[{ label: "Online", value: 12, tone: "online" },
//                  { label: "Offline", value: 3 }]} centerLabel="nodes" />
export { Donut } from "./donut";
export type { DonutProps, DonutSlice } from "./donut";

// BarChart — vertical or horizontal count bars with value labels.
//   <BarChart orientation="horizontal"
//     data={[{ label: "linux", value: 9 }, { label: "darwin", value: 4 }]} />
export { BarChart } from "./bar-chart";
export type { BarChartProps, BarDatum } from "./bar-chart";

// Timeline — events on a horizontal time axis (e.g. key expiries), with an
// optional "now" marker.
//   <Timeline now={Date.now()} events={[{ label: "laptop key",
//     time: expiryMs, tone: "warn" }]} />
export { Timeline } from "./timeline";
export type { TimelineProps, TimelineEvent } from "./timeline";

// Shared tone type + formatting helpers, in case callers need to precompute.
export {
  type ChartTone,
  formatCompact,
  niceCeil,
} from "./shared";
