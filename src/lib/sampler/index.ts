/**
 * Background sampler for the tailnet-size time series (server-only).
 *
 * WHY THIS EXISTS
 *
 * Snapshots used to be written only when somebody opened the dashboard
 * (throttled to one every few minutes), so the series recorded *when the console
 * was used*, not the passage of time. Measured on a real instance: 28 samples
 * over 4.9 days, a median gap of 21 minutes and a largest gap of 2.8 days. An
 * "online over time" chart drawn from that is mostly interpolation.
 *
 * HOW IT TICKS
 *
 * Started from `src/instrumentation.ts`, which Next.js calls once per server
 * instance. The tick is a fixed one-minute `setInterval`; the CONFIGURED
 * interval is not the timer's period but the throttle window handed to
 * {@link recordSnapshotThrottled}. That indirection is the whole design, and it
 * buys four things that a `setInterval(configuredInterval)` would each need
 * separate code for:
 *
 *   - A dashboard visit and a tick can never both record inside one interval:
 *     they pass through the same gate, which asks the database how old the last
 *     sample is rather than trusting a timer.
 *   - Changing the interval in Settings takes effect within a minute, with no
 *     restart and no timer teardown - matching what every Settings page in this
 *     console promises.
 *   - A missed tick (a busy or briefly paused process) self-corrects at the next
 *     one instead of shifting the whole schedule.
 *   - Two server instances cannot double-sample; the second finds a fresh row
 *     and does nothing.
 *
 * COST
 *
 * A tick that decides to sample needs its own numbers - unlike the dashboard,
 * which reuses reads it was already doing. That is two control-plane calls
 * (nodes, users) per sample: 8 an hour at the 15-minute default, ~192 a day.
 */

import { getConfig } from "@/lib/config";
import { nodes as nodesApi, users as usersApi } from "@/lib/headscale";
import { latestSnapshot, recordSnapshotThrottled } from "@/lib/db";

/** How often the loop wakes up to ask whether a sample is due. */
const TICK_MS = 60_000;

/** Guard against a second interval when a module graph is evaluated twice. */
let started = false;
/**
 * Whether the last tick already reported a failure.
 *
 * A background job that fails silently forever is worse than a noisy one, but
 * repeating the same error every minute would drown a log that is otherwise
 * almost empty (seven `console.error` in the whole tree). So: complain once,
 * then stay quiet until something succeeds.
 */
let reportedFailure = false;

/**
 * Take one sample if the configured interval has elapsed since the last one.
 *
 * Never throws: an unreachable control plane, an unconfigured connection or a
 * missing database all mean "no sample this time", which the next tick retries.
 * A background job must not be able to crash the server it lives in.
 */
export async function sampleTailnetSize(): Promise<"recorded" | "skipped"> {
  try {
    const config = getConfig();
    if (config.snapshots.intervalMinutes <= 0) return "skipped";
    // No connection yet (a fresh install still in /setup): nothing to sample.
    if (!config.headscale) return "skipped";

    // Cheap pre-check before spending two API calls: if a sample was written
    // recently - by an earlier tick or by someone opening the dashboard - the
    // throttle would discard ours anyway.
    const windowMs = config.snapshots.intervalMinutes * 60_000;
    const latest = await latestSnapshot();
    if (latest && Date.now() - latest.ts.getTime() < windowMs) return "skipped";

    const [nodeList, userList] = await Promise.all([nodesApi.list(), usersApi.list()]);
    const online = nodeList.filter((node) => node.online).length;

    const written = await recordSnapshotThrottled(
      { total: nodeList.length, online, users: userList.length },
      windowMs,
    );
    reportedFailure = false;
    return written ? "recorded" : "skipped";
  } catch (error) {
    if (!reportedFailure) {
      reportedFailure = true;
      console.error(
        "sampler: could not record a tailnet snapshot; will keep trying quietly",
        error,
      );
    }
    return "skipped";
  }
}

/**
 * Start the sampling loop. Idempotent, and safe to call before the control
 * plane is reachable.
 *
 * Returns immediately: `register()` in instrumentation must complete before the
 * server accepts requests, so nothing here may await a network round trip.
 */
export function startSampler(): void {
  if (started) return;
  started = true;

  const timer = setInterval(() => {
    void sampleTailnetSize();
  }, TICK_MS);
  // Do not hold the event loop open on our account; the server's own listener
  // decides when the process lives or dies.
  timer.unref?.();

  // One sample shortly after boot, so a restart does not leave a hole the width
  // of the interval. Delayed rather than immediate: the connection config and
  // the database are read lazily, and a restart is exactly when the control
  // plane is most likely to still be settling.
  const initial = setTimeout(() => {
    void sampleTailnetSize();
  }, 15_000);
  initial.unref?.();
}
