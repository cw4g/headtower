/**
 * Time-series shaping for the line chart — pure, dependency-free, unit-tested
 * apart from the SVG that draws it.
 *
 * WHY BUCKETING
 *
 * A sampled series is not a function of time; it is a set of observations. Drawn
 * naively, three things go wrong, all measured on a real instance:
 *
 *   - Samples cluster. Before the background sampler existed they were written
 *     only when someone opened the dashboard: 28 samples over 4.9 days, median
 *     gap 21 minutes, largest gap 2.8 days. On a linear axis that is a few
 *     scribbles joined by long ramps, one of which spanned 396 of 704 units.
 *   - Those ramps are a lie. A straight segment across a gap asserts that the
 *     value moved smoothly between two readings, when in truth nothing was
 *     measured in between.
 *   - Axis labels picked by sample INDEX land at arbitrary times. The old chart
 *     put ticks at samples 0, 7, 14, 20, 27 — two of which fell on the same
 *     calendar day and rendered the identical label, overlapping.
 *
 * Bucketing fixes the shape rather than the symptoms: lay an evenly spaced grid
 * over the span, put each observation in its bucket, and leave empty buckets
 * EMPTY. The result is a regular series whose holes are explicit — so the line
 * can break where nothing was observed, and a tick's position is meaningful
 * because the x grid is uniform.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Bucket widths worth choosing, smallest first.
 *
 * All divide cleanly into an hour or a day, so bucket boundaries land on round
 * clock times and a tick reads as "14:00", not "14:07".
 */
export const BUCKET_STEPS = [
  MINUTE,
  5 * MINUTE,
  15 * MINUTE,
  30 * MINUTE,
  HOUR,
  3 * HOUR,
  6 * HOUR,
  12 * HOUR,
  DAY,
] as const;

/**
 * The narrowest bucket that keeps the point count at or under `targetPoints`
 * AND is wider than the data's own typical spacing.
 *
 * `targetPoints` should be near the chart's width in coordinate units: more
 * points than units cannot be told apart, and the extra only lengthens the path
 * string.
 *
 * `typicalGapMs` is the second condition and it is not cosmetic. Samples never
 * land exactly on the cadence - the sampler's effective interval is the
 * configured one rounded up to its next tick - so bucketing 15-minute samples
 * into 15-minute buckets leaves the occasional bucket empty although nothing was
 * missed. Those phantom holes would break the line and claim an outage that
 * never happened, which is the same dishonesty as interpolating a real gap, only
 * pointing the other way. Requiring the bucket to be strictly wider than the
 * typical gap means a hole appears when sampling actually lapsed.
 */
export function chooseBucketMs(
  spanMs: number,
  targetPoints: number,
  typicalGapMs = 0,
): number {
  if (!(spanMs > 0) || !(targetPoints > 0)) return BUCKET_STEPS[0];
  for (const step of BUCKET_STEPS) {
    if (spanMs / step <= targetPoints && step > typicalGapMs) return step;
  }
  return BUCKET_STEPS[BUCKET_STEPS.length - 1];
}

/**
 * The median interval between consecutive times — the "typical gap" for
 * {@link chooseBucketMs}.
 *
 * Median, not mean: with clustered data the mean is dragged up by the long empty
 * stretches, which are exactly what the buckets must NOT be sized for.
 */
export function medianGap(times: readonly number[]): number {
  if (times.length < 2) return 0;
  const sorted = [...times].sort((a, b) => a - b);
  const gaps = sorted.slice(1).map((t, i) => t - sorted[i]);
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 === 1 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
}

export interface Bucketed<T> {
  /** Bucket start times: evenly spaced, covering the whole span, no holes. */
  x: number[];
  /** The observation in each bucket, or null where nothing was observed. */
  samples: Array<T | null>;
  bucketMs: number;
}

/** Hard ceiling on buckets, so bad input cannot allocate an enormous array. */
const MAX_BUCKETS = 5_000;

/**
 * Lay an evenly spaced grid over the items' span and place each item in its
 * bucket.
 *
 * When several observations share a bucket the LAST one wins, deliberately: it
 * is a value that was actually read. Averaging would invent a reading nobody
 * ever took — and for a device count, "8.75 online" is not a thing that
 * happened.
 *
 * Bucket starts are aligned to the epoch rather than to the first item, so the
 * grid lands on round clock times for every step in {@link BUCKET_STEPS}.
 */
export function bucketByTime<T>(
  items: readonly T[],
  timeOf: (item: T) => number,
  bucketMs: number,
): Bucketed<T> {
  const step = bucketMs > 0 ? bucketMs : BUCKET_STEPS[0];
  const times = items.map(timeOf).filter((t) => Number.isFinite(t));
  if (times.length === 0) return { x: [], samples: [], bucketMs: step };

  const lo = Math.floor(Math.min(...times) / step) * step;
  const hi = Math.floor(Math.max(...times) / step) * step;
  const count = Math.min(MAX_BUCKETS, Math.floor((hi - lo) / step) + 1);

  const x: number[] = [];
  const samples: Array<T | null> = [];
  for (let i = 0; i < count; i++) {
    x.push(lo + i * step);
    samples.push(null);
  }

  for (const item of items) {
    const t = timeOf(item);
    if (!Number.isFinite(t)) continue;
    const index = Math.floor((Math.floor(t / step) * step - lo) / step);
    if (index >= 0 && index < count) samples[index] = item;
  }

  return { x, samples, bucketMs: step };
}

/**
 * Index ranges of consecutive non-null values.
 *
 * What turns holes into breaks: each run becomes its own path, so the stroke
 * simply stops where observation stopped instead of ramping across it. A run of
 * one is included — a lone reading between two gaps is a real datum, and the
 * chart draws it as a dot.
 */
export function runsOfPresent(values: readonly (number | null)[]): Array<{
  from: number;
  to: number;
}> {
  const runs: Array<{ from: number; to: number }> = [];
  let start: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const present = values[i] != null;
    if (present && start === null) start = i;
    if (!present && start !== null) {
      runs.push({ from: start, to: i - 1 });
      start = null;
    }
  }
  if (start !== null) runs.push({ from: start, to: values.length - 1 });
  return runs;
}

/** `count` evenly spaced times across [lo, hi], inclusive of both ends. */
export function timeTicks(lo: number, hi: number, count: number): number[] {
  if (!(count > 0)) return [];
  if (count === 1 || hi <= lo) return [lo];
  return Array.from({ length: count }, (_, i) => lo + ((hi - lo) * i) / (count - 1));
}

/** Month names for the UTC formatters below. */
const MONTHS_UTC = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * A date formatter matched to how far apart the ticks are, not to the total
 * span, and built from UTC parts.
 *
 * Two separate reasons for that, both learned the hard way:
 *
 * Spacing, not span: the old chart used time-of-day only when the whole series
 * fitted in two days, so a five-day span labelled everything by date and two
 * ticks five hours apart both read "Aug 24", overlapping. Deriving from the
 * spacing makes duplicate labels impossible.
 *
 * UTC, and assembled by hand rather than via `toLocaleString`: the old comment
 * claimed "fixed locale so the SSR pass and the client hydrate render the same
 * ticks", but a fixed locale does not fix the TIME ZONE. The server renders in
 * UTC and the browser in its own zone, which for a date-only label usually
 * happens to agree and for an hour-bearing label never does - it surfaced
 * immediately as React hydration error #418. UTC also matches the console's
 * existing discipline (see `formatUtc` in @/lib/machines).
 */
export function tickFormatter(
  spacingMs: number,
  spanMs: number,
): (t: number) => string {
  if (spacingMs < DAY) {
    const sameDay = spanMs < DAY;
    return (t) => {
      const d = new Date(t);
      const time = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
      return sameDay
        ? time
        : `${MONTHS_UTC[d.getUTCMonth()]} ${d.getUTCDate()} ${time}`;
    };
  }
  return (t) => {
    const d = new Date(t);
    return `${MONTHS_UTC[d.getUTCMonth()]} ${d.getUTCDate()}`;
  };
}

/** Precise UTC stamp for a single sample, e.g. "Aug 26 13:45 UTC". */
export function sampleFormatter(): (t: number) => string {
  return (t) => {
    const d = new Date(t);
    return (
      `${MONTHS_UTC[d.getUTCMonth()]} ${d.getUTCDate()} ` +
      `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`
    );
  };
}
