/**
 * DeviceBreakdown - horizontal bar rows for one agent-reported dimension (OS or
 * client version). Pure presentation over the shared chart kit's `BarChart`, the
 * same server-renderable SVG approach `OnlineTrend` builds on for its own chart -
 * this one needs no client boundary at all, since there is no interactivity.
 *
 * The agent is optional enrichment (see `@/lib/agent`), so an empty `bars` list
 * renders a quiet hint instead of a blank chart. The caller decides the hint's
 * wording (it knows whether the agent is off or simply hasn't reported in yet),
 * this component only decides when to show one.
 *
 * Intended to sit inside the dashboard's own `Widget` wrapper, so it renders
 * bare - no card chrome of its own, matching how `OnlineTrend` is used.
 */
import { BarChart, type BarDatum } from "@/components/charts";

export interface DeviceBreakdownProps {
  bars: BarDatum[];
  /** Shown in place of the chart when there is nothing to plot yet. */
  emptyHint: string;
}

export function DeviceBreakdown({ bars, emptyHint }: DeviceBreakdownProps) {
  if (bars.length === 0) {
    return (
      <p className="flex flex-1 items-center justify-center px-2 py-8 text-center text-xs text-ink-faint">
        {emptyHint}
      </p>
    );
  }

  return <BarChart orientation="horizontal" data={bars} />;
}
