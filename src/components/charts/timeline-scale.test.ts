/**
 * Segmented timeline scale + label packing tests.
 *
 * Runs on plain Node (`node --test`); see policy/model.test.ts for why there is
 * no test runner.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  estimateTextWidth,
  placeLabels,
  segmentedTimeScale,
} from "./timeline-scale";

const DAY = 86_400_000;
const RANGE: [number, number] = [40, 720];

/** The shape the real dashboard hands in: "now", then a cluster months later. */
const NOW = 1_700_000_000_000;
const CLUSTER = [NOW + 174 * DAY, NOW + 176 * DAY, NOW + 177 * DAY];

test("two isolated points far apart are left on a straight axis", () => {
  // The machine-detail shape: one registration 18 months ago plus "now". A
  // linear axis reads fine here and the distance IS the information, so the
  // empty stretch must not be compressed just because it is large.
  const created = NOW - 548 * DAY;
  const scale = segmentedTimeScale(
    [created, NOW],
    [created - 30 * DAY, NOW + 30 * DAY],
    RANGE,
  );
  assert.equal(scale.broken, false);
  assert.equal(scale.gaps.length, 0);
});

test("a long empty stretch becomes one marked break", () => {
  const scale = segmentedTimeScale(
    [NOW, ...CLUSTER],
    [NOW - DAY, CLUSTER[2] + DAY],
    RANGE,
  );
  assert.equal(scale.broken, true);
  assert.equal(scale.gaps.length, 1);
});

test("the cluster stops being a single point once the gap is compressed", () => {
  const domain: [number, number] = [NOW - DAY, CLUSTER[2] + DAY];
  const linear = (t: number) =>
    RANGE[0] + ((t - domain[0]) / (domain[1] - domain[0])) * (RANGE[1] - RANGE[0]);
  // Before: the three events span 3 of 680 units, i.e. the measured bug.
  assert.ok(linear(CLUSTER[2]) - linear(CLUSTER[0]) < 15);

  const scale = segmentedTimeScale([NOW, ...CLUSTER], domain, RANGE);
  const spread = scale.at(CLUSTER[2]) - scale.at(CLUSTER[0]);
  assert.ok(spread > 100, `cluster should occupy real width, got ${spread}`);
});

test("several clusters each keep their own width", () => {
  // The case that rules out simply zooming to the events: three cohorts of
  // devices, each expiring together, with months of nothing in between.
  const times = [
    NOW,
    NOW + 100 * DAY, NOW + 101 * DAY,
    NOW + 300 * DAY, NOW + 302 * DAY,
    NOW + 600 * DAY, NOW + 601 * DAY,
  ];
  const scale = segmentedTimeScale(times, [NOW - DAY, NOW + 601 * DAY], RANGE);
  assert.equal(scale.broken, true);
  assert.equal(scale.gaps.length, 3);
  for (const [a, b] of [
    [times[1], times[2]],
    [times[3], times[4]],
    [times[5], times[6]],
  ]) {
    assert.ok(scale.at(b) - scale.at(a) > 20, "each cohort needs visible width");
  }
});

test("positions stay monotonic across breaks", () => {
  const times = [NOW, NOW + 200 * DAY, NOW + 201 * DAY, NOW + 500 * DAY];
  const scale = segmentedTimeScale(times, [NOW, NOW + 500 * DAY], RANGE);
  const xs = times.map((t) => scale.at(t));
  for (let i = 1; i < xs.length; i++) {
    assert.ok(xs[i] >= xs[i - 1], `not monotonic at ${i}: ${xs[i - 1]} -> ${xs[i]}`);
  }
});

test("a broken axis still fills its range exactly", () => {
  // Regression: cutting between marks left adjacent breaks with no span in
  // between, and the axis collapsed to the breaks' combined width (ended at 118
  // of 720). Every mark must land inside a span.
  const times = [
    NOW,
    NOW + 100 * DAY, NOW + 101 * DAY,
    NOW + 300 * DAY, NOW + 302 * DAY,
    NOW + 600 * DAY, NOW + 601 * DAY,
  ];
  const scale = segmentedTimeScale(times, [NOW, NOW + 601 * DAY], RANGE);
  assert.equal(scale.broken, true);
  const last = scale.segments[scale.segments.length - 1];
  assert.equal(scale.segments[0].x0, RANGE[0]);
  assert.ok(Math.abs(last.x1 - RANGE[1]) < 0.001, `ends at ${last.x1}`);
  // Segments must tile the range with no hole and no overlap.
  for (let i = 1; i < scale.segments.length; i++) {
    assert.ok(
      Math.abs(scale.segments[i].x0 - scale.segments[i - 1].x1) < 0.001,
      `seam ${i}: ${scale.segments[i - 1].x1} -> ${scale.segments[i].x0}`,
    );
  }
});

test("no time can be positioned outside the frame", () => {
  const times = [NOW, NOW + 200 * DAY, NOW + 201 * DAY, NOW + 500 * DAY];
  const scale = segmentedTimeScale(times, [NOW, NOW + 500 * DAY], RANGE);
  for (const t of [NOW - 999 * DAY, NOW, NOW + 250 * DAY, NOW + 500 * DAY, NOW + 999 * DAY]) {
    const x = scale.at(t);
    assert.ok(x >= RANGE[0] && x <= RANGE[1], `t=${t} mapped to ${x}`);
  }
});

test("an unbroken axis maps its domain bounds onto the range bounds", () => {
  const scale = segmentedTimeScale([NOW, NOW + 10 * DAY], [NOW, NOW + 10 * DAY], RANGE);
  assert.equal(scale.broken, false);
  assert.equal(scale.at(NOW - 999 * DAY), RANGE[0]);
  assert.equal(scale.at(NOW + 999 * DAY), RANGE[1]);
});

test("a zero-width domain degrades without dividing by zero", () => {
  const scale = segmentedTimeScale([NOW], [NOW, NOW], RANGE);
  assert.equal(scale.broken, false);
  assert.ok(Number.isFinite(scale.at(NOW)));
});

test("an evenly spread axis is not broken up even when the gaps are large", () => {
  // Five points 25 days apart: every gap is 25% of the domain, comfortably over
  // the absolute threshold, but none is an outlier. Breaking here would claim
  // time was skipped on an ordinary linear axis.
  const times = Array.from({ length: 5 }, (_, i) => NOW + i * 25 * DAY);
  const scale = segmentedTimeScale(times, [times[0], times[4]], RANGE);
  assert.equal(scale.broken, false);
  assert.equal(scale.gaps.length, 0);
});

test("breaks that would eat the chart fall back to linear", () => {
  // Three real clusters, but a range too narrow to spend 26 units per break on.
  const times = [
    NOW,
    NOW + 100 * DAY, NOW + 101 * DAY,
    NOW + 300 * DAY, NOW + 302 * DAY,
    NOW + 600 * DAY, NOW + 601 * DAY,
  ];
  const wide = segmentedTimeScale(times, [NOW, NOW + 601 * DAY], RANGE);
  assert.equal(wide.broken, true, "the same data does break when there is room");

  const narrow = segmentedTimeScale(times, [NOW, NOW + 601 * DAY], [0, 90]);
  assert.equal(narrow.broken, false);
});

test("estimated label width grows with text and font size", () => {
  assert.ok(estimateTextWidth("annes-macbook-pro", 11) > estimateTextWidth("pixel-8a", 11));
  assert.ok(estimateTextWidth("same", 14) > estimateTextWidth("same", 11));
});

/** Recompute each label's box the way the renderer will, to assert on overlap. */
function boxes(
  placements: ReturnType<typeof placeLabels<{ label: string; x: number }>>["placements"],
  fontSize: number,
) {
  return placements.map((p) => {
    const w = estimateTextWidth(p.item.label, fontSize);
    const left =
      p.anchor === "start" ? p.textX : p.anchor === "end" ? p.textX - w : p.textX - w / 2;
    return { key: `${p.side}:${p.row}`, left, right: left + w, label: p.item.label };
  });
}

test("no two labels in the same row overlap", () => {
  // The regression this exists for: three events within a few units of each
  // other used to overlap by 82px because alternation was index-based.
  const items = [
    { label: "annes-macbook-pro", x: 700 },
    { label: "xiaomipad6", x: 704 },
    { label: "pixel-8a", x: 706 },
    { label: "christophs-pixel-9a", x: 708 },
  ];
  const { placements } = placeLabels(items, {
    x: (i) => i.x,
    label: (i) => i.label,
    fontSize: 11,
    bounds: RANGE,
  });
  const byRow = new Map<string, Array<{ left: number; right: number }>>();
  for (const b of boxes(placements, 11)) {
    const list = byRow.get(b.key) ?? [];
    list.push(b);
    byRow.set(b.key, list);
  }
  for (const [row, list] of byRow) {
    list.sort((a, b) => a.left - b.left);
    for (let i = 1; i < list.length; i++) {
      assert.ok(
        list[i].left >= list[i - 1].right,
        `overlap in row ${row}: ${list[i - 1].right} > ${list[i].left}`,
      );
    }
  }
});

test("a tight cluster is spread over both sides and several rows", () => {
  const items = Array.from({ length: 6 }, (_, i) => ({
    label: `device-number-${i}`,
    x: 400 + i * 3,
  }));
  const { placements, rowsAbove, rowsBelow } = placeLabels(items, {
    x: (i) => i.x,
    label: (i) => i.label,
    fontSize: 11,
    bounds: RANGE,
  });
  assert.equal(placements.length, 6);
  assert.ok(rowsAbove >= 2 && rowsBelow >= 2, `rows: ${rowsAbove}/${rowsBelow}`);
  // Nearest-the-axis rows fill first, so no row is skipped.
  const rows = new Set(placements.map((p) => `${p.side}:${p.row}`));
  assert.ok(rows.has("above:0") && rows.has("below:0"));
});

test("well separated labels all stay in the innermost rows", () => {
  const items = [
    { label: "a", x: 100 },
    { label: "b", x: 300 },
    { label: "c", x: 500 },
  ];
  const { rowsAbove, rowsBelow } = placeLabels(items, {
    x: (i) => i.x,
    label: (i) => i.label,
    fontSize: 11,
    bounds: RANGE,
  });
  assert.equal(rowsAbove, 1);
  assert.equal(rowsBelow, 0);
});

test("edge labels are anchored inwards so they cannot spill out", () => {
  const items = [
    { label: "a-very-long-device-name-at-the-left", x: 41 },
    { label: "a-very-long-device-name-at-the-right", x: 719 },
  ];
  const { placements } = placeLabels(items, {
    x: (i) => i.x,
    label: (i) => i.label,
    fontSize: 11,
    bounds: RANGE,
  });
  const left = placements.find((p) => p.x === 41)!;
  const right = placements.find((p) => p.x === 719)!;
  assert.equal(left.anchor, "start");
  assert.equal(right.anchor, "end");
  for (const b of boxes(placements, 11)) {
    assert.ok(b.left >= RANGE[0] - 0.001, `${b.label} spills left: ${b.left}`);
    assert.ok(b.right <= RANGE[1] + 0.001, `${b.label} spills right: ${b.right}`);
  }
});
