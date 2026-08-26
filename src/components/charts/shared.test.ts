/**
 * Path builder tests.
 *
 * Runs on plain Node (`node --test`); see policy/model.test.ts for why there is
 * no test runner.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { linePath, stepPath } from "./shared";

test("a straight path joins samples directly", () => {
  assert.equal(linePath([[0, 10], [10, 20]]), "M0 10 L10 20");
});

test("a step path holds the value, then jumps", () => {
  // The horizontal comes first: the old value carries forward to the new x, and
  // only there does it change. Stepping the other way round would back-date the
  // change to the start of the interval.
  assert.equal(stepPath([[0, 10], [10, 20]]), "M0 10 L10 10 L10 20");
});

test("an unchanged value emits no vertical segment", () => {
  // A flat stretch is one line, not a run of zero-height jumps.
  assert.equal(stepPath([[0, 5], [10, 5], [20, 5]]), "M0 5 L10 5 L20 5");
});

test("a step path never leaves the levels it was given", () => {
  // The whole point of the shape: no intermediate heights. A diagonal between
  // two integer device counts would draw values the y axis cannot label.
  const levels = [10, 20, 15];
  const d = stepPath([[0, 10], [10, 20], [20, 15]]);
  const ys = [...d.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(ys.length > 0);
  for (const y of ys) assert.ok(levels.includes(y), `${y} is not a sampled level`);
});

test("a straight path passes through values that were never read", () => {
  // The contrast that justifies stepPath, pinned down rather than asserted: the
  // endpoints are observations, everything between them is interpolation - and
  // for a whole-device count, an impossibility.
  const d = linePath([[0, 10], [20, 20]]);
  assert.equal(d, "M0 10 L20 20");
  const ys = [...d.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
  // Only the endpoints appear in the path; the rest is the renderer's straight
  // interpolation, which is exactly what a step avoids.
  assert.deepEqual(ys, [10, 20]);
});

test("a single sample is just a move", () => {
  assert.equal(stepPath([[5, 5]]), "M5 5");
});

test("no samples yields an empty path, not a broken one", () => {
  assert.equal(stepPath([]), "");
});
