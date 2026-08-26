"use client";

/**
 * SamplingPanel — how often Headtower records the tailnet's size.
 *
 * A client leaf only because the input and the save call need a click handler;
 * the current value and the last sample's age are computed on the server.
 *
 * The "last sample" readout is here on purpose. This console has almost no
 * server-side logging, so a background job would otherwise be entirely
 * unobservable — an operator could not tell a working sampler from a silent one.
 */

import * as React from "react";
import { Timer, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { saveSamplingInterval } from "./actions";

export interface SamplingPanelProps {
  intervalMinutes: number;
  /** Epoch-ms of the newest recorded sample, or null when there is none. */
  lastSampleAt: number | null;
  /** Total rows in the history, so the cost of a cadence is visible. */
  sampleCount: number;
  canWrite: boolean;
}

/** Coarse "how long ago", enough to tell a live sampler from a stalled one. */
function ago(epochMs: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - epochMs) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function SamplingPanel({
  intervalMinutes,
  lastSampleAt,
  sampleCount,
  canWrite,
}: SamplingPanelProps) {
  const [value, setValue] = React.useState(String(intervalMinutes));
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const parsed = Number(value);
  const valid = Number.isInteger(parsed) && parsed >= 0;
  const dirty = String(intervalMinutes) !== value.trim();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveSamplingInterval(parsed);
      if (result.status === "error") setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card border border-line bg-surface text-ink-muted">
            <Timer className="h-5 w-5" aria-hidden />
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-ink">History sampling</p>
            <p className="max-w-xl text-xs text-ink-muted">
              How often the tailnet&apos;s size is recorded for the
              online-over-time chart. A background timer takes one sample per
              interval; opening the dashboard can also take one, and the same
              interval keeps the two from doubling up. Set 0 to sample only when
              the dashboard is opened — which makes the series record when the
              console was used, not the passage of time.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted">Interval</span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={1440}
                step={1}
                value={value}
                disabled={!canWrite || pending}
                onChange={(e) => {
                  setValue(e.target.value);
                  setSaved(false);
                }}
                className="data w-24 rounded-control border border-line-strong bg-canvas px-2 py-1.5 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/50 disabled:opacity-60"
              />
              <span className="text-xs text-ink-faint">minutes</span>
            </span>
          </label>

          {canWrite && (
            <Button
              variant={dirty && valid ? "solid" : "outline"}
              onClick={save}
              disabled={!valid || !dirty || pending}
            >
              {pending ? "Saving…" : "Save"}
            </Button>
          )}

          <div className="flex flex-col gap-1 text-xs text-ink-faint">
            <span>
              {sampleCount.toLocaleString()} sample
              {sampleCount === 1 ? "" : "s"} stored
            </span>
            <span>
              {lastSampleAt != null ? `last ${ago(lastSampleAt)}` : "none recorded yet"}
            </span>
          </div>
        </div>

        {!canWrite && (
          <p className="text-xs text-ink-faint">
            Changing this needs the{" "}
            <span className="data text-ink-muted">settings.write</span> capability.
          </p>
        )}

        {error && (
          <p className="flex items-start gap-1.5 text-xs text-critical-500">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        {saved && !error && (
          <p className="text-xs text-ink-muted">
            Saved.{" "}
            {parsed === 0 ? (
              "Background sampling is off."
            ) : (
              <>
                Takes effect within a minute — the sampler re-reads this on its
                next tick, so no restart.
              </>
            )}{" "}
            <Chip variant="default" mono>
              {parsed === 0 ? "off" : `${parsed} min`}
            </Chip>
          </p>
        )}
      </CardBody>
    </Card>
  );
}
