/**
 * Time-series shaping tests.
 *
 * Runs on plain Node (`node --test`); see policy/model.test.ts for why there is
 * no test runner.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  BUCKET_STEPS,
  bucketByTime,
  chooseBucketMs,
  medianGap,
  runsOfPresent,
  tickFormatter,
  timeTicks,
} from "./series";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const T0 = 1_787_000_000_000;

const at = (offsetMs: number, online = 1) => ({ ts: T0 + offsetMs, online });
const timeOf = (s: { ts: number }) => s.ts;

test("a 30-day span buckets to about one point per chart unit", () => {
  // 704 usable units on the real chart; hourly gives 721 points, which is the
  // finest step that stays in that neighbourhood.
  assert.equal(chooseBucketMs(30 * DAY, 750), HOUR);
});

test("a short span keeps a fine bucket", () => {
  assert.equal(chooseBucketMs(3 * HOUR, 750), MINUTE);
  assert.equal(chooseBucketMs(2 * DAY, 200), 15 * MINUTE);
});

test("an absurd span falls back to the widest step rather than exploding", () => {
  assert.equal(chooseBucketMs(50 * 365 * DAY, 10), BUCKET_STEPS[BUCKET_STEPS.length - 1]);
});

test("empty buckets are present and null, not skipped", () => {
  // Two readings an hour apart, bucketed by 15 minutes: four buckets, two of
  // them empty. Those holes are the whole point.
  const { x, samples } = bucketByTime([at(0), at(HOUR)], timeOf, 15 * MINUTE);
  assert.equal(x.length, 5);
  assert.equal(samples.length, 5);
  assert.deepEqual(
    samples.map((s) => (s === null ? null : "sample")),
    ["sample", null, null, null, "sample"],
  );
});

test("the grid is evenly spaced", () => {
  const { x } = bucketByTime([at(0), at(3 * HOUR)], timeOf, HOUR);
  const gaps = x.slice(1).map((v, i) => v - x[i]);
  assert.deepEqual(new Set(gaps), new Set([HOUR]));
});

test("bucket starts align to the clock, not to the first sample", () => {
  // A first reading at :37 must not put every boundary on :37. Aligning to the
  // epoch instead means each boundary is an exact multiple of the step, which is
  // what makes a tick read "14:00".
  const offset = 37 * MINUTE;
  const { x } = bucketByTime([at(offset), at(offset + 2 * HOUR)], timeOf, HOUR);
  assert.ok(x.length >= 3);
  for (const t of x) assert.equal(t % HOUR, 0, `${t} is not on an hour boundary`);
});

test("several readings in one bucket keep the last, not an average", () => {
  // An average would invent a device count nobody ever read.
  const { samples } = bucketByTime(
    [at(0, 5), at(MINUTE, 8), at(2 * MINUTE, 6)],
    timeOf,
    HOUR,
  );
  assert.equal(samples.length, 1);
  assert.equal(samples[0]?.online, 6);
});

test("no items yields no buckets rather than a bogus grid", () => {
  const { x, samples } = bucketByTime([], timeOf, HOUR);
  assert.deepEqual(x, []);
  assert.deepEqual(samples, []);
});

test("the real measured shape stops being one smudge plus a ramp", () => {
  // The clustering that started this: six readings within an hour, then nothing
  // for 2.8 days, then two more.
  const items = [
    at(0), at(10 * MINUTE), at(20 * MINUTE), at(35 * MINUTE), at(50 * MINUTE),
    at(2.8 * DAY), at(2.8 * DAY + 20 * MINUTE),
  ];
  const bucketMs = chooseBucketMs(2.8 * DAY + 20 * MINUTE, 750);
  const { samples } = bucketByTime(items, timeOf, bucketMs);
  const runs = runsOfPresent(samples.map((s) => (s ? s.online : null)));
  // Two separate stretches of observation, not one continuous line.
  assert.equal(runs.length, 2);
  assert.ok(samples.filter((s) => s === null).length > 50, "the gap is explicit");
});

test("runs split at every hole", () => {
  assert.deepEqual(runsOfPresent([1, 2, null, 3, null, null, 4, 5]), [
    { from: 0, to: 1 },
    { from: 3, to: 3 },
    { from: 6, to: 7 },
  ]);
});

test("a fully present series is one run", () => {
  assert.deepEqual(runsOfPresent([1, 2, 3]), [{ from: 0, to: 2 }]);
});

test("an all-empty series has no runs", () => {
  assert.deepEqual(runsOfPresent([null, null]), []);
});

test("a lone reading between gaps survives as its own run", () => {
  assert.deepEqual(runsOfPresent([null, 7, null]), [{ from: 1, to: 1 }]);
});

test("ticks are evenly spaced in time and hit both ends", () => {
  const ticks = timeTicks(0, 100, 5);
  assert.deepEqual(ticks, [0, 25, 50, 75, 100]);
});

test("a zero-width domain yields one tick, not a division by zero", () => {
  assert.deepEqual(timeTicks(42, 42, 5), [42]);
});

test("hourly ticks over several days carry the hour, so they cannot duplicate", () => {
  // The measured bug: two ticks five hours apart both read "Aug 24".
  const format = tickFormatter(6 * HOUR, 5 * DAY);
  const a = format(T0);
  const b = format(T0 + 6 * HOUR);
  assert.notEqual(a, b);
  assert.match(a, /\d{2}:\d{2}/);
});

test("daily ticks drop the time", () => {
  const format = tickFormatter(DAY, 30 * DAY);
  assert.doesNotMatch(format(T0), /\d{2}:\d{2}/);
});

test("within a single day the date is redundant and omitted", () => {
  const format = tickFormatter(HOUR, 6 * HOUR);
  assert.match(format(T0), /^\d{2}:\d{2}/);
});

test("the bucket is never as narrow as the sampling cadence", () => {
  // 15-minute sampling drifts by seconds, so 15-minute buckets would leave the
  // odd one empty and break the line where nothing was missed.
  const cadence = 15 * MINUTE;
  const chosen = chooseBucketMs(7 * DAY, 700, cadence);
  assert.ok(chosen > cadence, `${chosen} must exceed the ${cadence}ms cadence`);
  assert.equal(chosen, 30 * MINUTE);
});

test("a steady cadence produces no holes at all", () => {
  // 3 days of samples every 15 minutes, each a little late, as the real sampler
  // is: bucketed, every bucket must be filled.
  const items = Array.from({ length: 3 * 96 }, (_, i) =>
    at(i * (15 * MINUTE + 7_000)),
  );
  const times = items.map(timeOf);
  const span = times[times.length - 1] - times[0];
  const bucketMs = chooseBucketMs(span, 700, medianGap(times));
  const { samples } = bucketByTime(items, timeOf, bucketMs);
  assert.equal(samples.filter((s) => s === null).length, 0);
  assert.equal(runsOfPresent(samples.map((s) => (s ? s.online : null))).length, 1);
});

test("a real lapse still shows as a hole", () => {
  // Steady cadence with two hours missing in the middle.
  const before = Array.from({ length: 40 }, (_, i) => at(i * 15 * MINUTE));
  const after = Array.from({ length: 40 }, (_, i) => at((40 + i) * 15 * MINUTE + 2 * HOUR));
  const items = [...before, ...after];
  const times = items.map(timeOf);
  const bucketMs = chooseBucketMs(times[times.length - 1] - times[0], 700, medianGap(times));
  const { samples } = bucketByTime(items, timeOf, bucketMs);
  const runs = runsOfPresent(samples.map((s) => (s ? s.online : null)));
  assert.equal(runs.length, 2, "the lapse must split the line");
});

test("the median gap ignores the long empty stretches", () => {
  // Six readings minutes apart, then 2.8 days, then two more: the mean gap is
  // hours, the median is minutes, and the buckets must follow the median.
  const times = [0, 10, 20, 35, 50, 60].map((m) => T0 + m * MINUTE);
  times.push(T0 + 2.8 * DAY, T0 + 2.8 * DAY + 20 * MINUTE);
  const median = medianGap(times);
  assert.ok(median < HOUR, `median ${median} should be minutes, not hours`);
});
