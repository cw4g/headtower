"use client";

/**
 * OnlineTrend - the dashboard's online-over-time line, wrapping the client
 * LineChart from the chart kit. It exists as its own client leaf so the server
 * dashboard can hand it plain serialisable numbers (snapshot points) and let the
 * axis/tooltip formatters - functions, which can't cross the server/client
 * boundary - be defined here on the client instead.
 */

import * as React from "react";
import { LineChart } from "@/components/charts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** One recorded tailnet sample, already projected to plain numbers. */
export interface OnlineTrendPoint {
  ts: number;
  online: number;
  total: number;
}

export function OnlineTrend({ points }: { points: OnlineTrendPoint[] }) {
  const x = points.map((p) => p.ts);
  // Fixed locale so the SSR pass and the client hydrate render the same ticks.
  const intraday = x.length > 1 && x[x.length - 1] - x[0] <= 2 * DAY_MS;
  const xFormat = React.useCallback(
    (t: number) =>
      new Date(t).toLocaleString(
        "en-US",
        intraday
          ? { hour: "2-digit", minute: "2-digit" }
          : { month: "short", day: "numeric" },
      ),
    [intraday],
  );

  return (
    <LineChart
      x={x}
      series={[
        {
          label: "Online",
          data: points.map((p) => p.online),
          tone: "online",
          area: true,
        },
        { label: "Devices", data: points.map((p) => p.total), tone: "neutral" },
      ]}
      xFormat={xFormat}
      yFormat={(v) => String(Math.round(v))}
      aria-label="Online devices over time"
    />
  );
}
