"use client";

/**
 * OnlineTrend - the dashboard's online-over-time line, wrapping the client
 * LineChart from the chart kit. It exists as its own client leaf so the server
 * dashboard can hand it plain serialisable numbers (snapshot points) and let the
 * axis/tooltip formatters - functions, which can't cross the server/client
 * boundary - be defined here on the client instead.
 *
 * The samples are BUCKETED onto an even time grid before they are drawn (see
 * `@/components/charts/series`). Snapshots do not arrive on a schedule - a
 * restart, a paused container or a 0-minute sampling setting all leave holes -
 * and a hole must read as a hole. Without this the chart drew a straight ramp
 * across 2.8 unmeasured days, which is a claim about the tailnet that nobody
 * ever observed.
 */

import * as React from "react";
import { LineChart } from "@/components/charts";
import {
  bucketByTime,
  chooseBucketMs,
  medianGap,
  sampleFormatter,
  tickFormatter,
} from "@/components/charts/series";

/**
 * Target number of plotted points.
 *
 * The chart is 704 coordinate units wide, so more points than that cannot be
 * told apart - they only lengthen the path string. Sitting just under it keeps
 * the finest bucket that is still legible.
 */
const TARGET_POINTS = 700;

/** One recorded tailnet sample, already projected to plain numbers. */
export interface OnlineTrendPoint {
  ts: number;
  online: number;
  total: number;
}

export function OnlineTrend({ points }: { points: OnlineTrendPoint[] }) {
  const { x, online, total } = React.useMemo(() => {
    if (points.length === 0) {
      return { x: [] as number[], online: [] as Array<number | null>, total: [] as Array<number | null> };
    }
    const span = points[points.length - 1].ts - points[0].ts;
    // The bucket must also be wider than the samples' own spacing, or a cadence
    // that drifts by a few seconds leaves empty buckets and the line breaks
    // where nothing was actually missed.
    const bucketMs = chooseBucketMs(span, TARGET_POINTS, medianGap(points.map((p) => p.ts)));
    const bucketed = bucketByTime(points, (p) => p.ts, bucketMs);
    return {
      x: bucketed.x,
      online: bucketed.samples.map((s) => (s ? s.online : null)),
      total: bucketed.samples.map((s) => (s ? s.total : null)),
    };
  }, [points]);

  // Built from UTC parts, like the rest of the console (see `formatUtc`): a
  // fixed locale does not fix the time zone, and a server rendering in UTC
  // against a browser rendering locally is a hydration mismatch on every label
  // that carries an hour. The tooltip names one sample and so stays precise to
  // the minute; the axis labels take their granularity from the tick spacing.
  const xFormat = React.useMemo(() => sampleFormatter(), []);

  const xTickFormat = React.useCallback(
    (spacingMs: number, spanMs: number) => tickFormatter(spacingMs, spanMs),
    [],
  );

  return (
    <LineChart
      x={x}
      series={[
        { label: "Online", data: online, tone: "online", area: true },
        { label: "Devices", data: total, tone: "neutral" },
      ]}
      xFormat={xFormat}
      xTickFormat={xTickFormat}
      yFormat={(v) => String(Math.round(v))}
      aria-label="Online devices over time"
    />
  );
}
