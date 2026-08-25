/**
 * Segmented time scale + label packing for the Timeline chart — pure,
 * dependency-free, and unit-tested separately from the SVG that draws it.
 *
 * WHY NOT A PLAIN LINEAR SCALE
 *
 * Timeline plots things like key expiries against a "now" marker. Headscale
 * keys share a fixed lifetime, so devices registered together expire together:
 * the real data is a handful of tight CLUSTERS separated by long empty
 * stretches, with "now" often months away from all of them. On a linear axis
 * that renders as an almost entirely blank chart with every event stacked on a
 * single pixel - measured on a real tailnet: three events inside 4.2 of 680
 * axis units, i.e. the last 0.6% of the width, while 98% sat empty.
 *
 * Dropping "now" from the domain would fix the crowding but lose the very
 * comparison the chart exists for. Zooming to the events only moves the problem
 * when there are SEVERAL clusters - the gaps between them are then blank.
 *
 * So the axis is cut into segments: "span" segments carry the clusters, "gap"
 * segments stand for skipped emptiness and are drawn with a break glyph. Time
 * inside a span stays strictly linear; only the marked breaks are compressed.
 *
 * WHICH PART OF THE AXIS IS ELASTIC
 *
 * Spans get the width their CONTENT needs and no more; the breaks absorb
 * whatever is left over. That assignment is the whole trick, and it took two
 * measured failures to find:
 *
 *   - Sizing spans by DURATION handed an empty padding day 210 of 680 units
 *     (31% of the chart), drawing one day eight times wider than the 176-day
 *     break beside it.
 *   - Sizing spans by content but still stretching them to fill the frame gave
 *     a one-day cluster ~600 units while 176 days kept 26 - a day drawn 22
 *     times wider than half a year.
 *
 * A break is the right elastic element because it is the only part of the axis
 * already declared non-linear: stretching it costs no honesty, while stretching
 * a span inflates its local time scale and lies about it.
 */

/** One piece of a segmented axis: real time (`span`) or skipped time (`gap`). */
export interface TimelineSegment {
  kind: "span" | "gap";
  /** Domain bounds of the piece, epoch-ms. */
  from: number;
  to: number;
  /** Range bounds of the piece, in coordinate units. */
  x0: number;
  x1: number;
}

export interface SegmentedScale {
  segments: TimelineSegment[];
  /** Map an epoch-ms to a coordinate. Times outside the domain clamp to it. */
  at: (t: number) => number;
  /** The gap pieces, for drawing break glyphs. */
  gaps: TimelineSegment[];
  /** True when the axis was actually broken (no gap => a plain linear axis). */
  broken: boolean;
}

export interface SegmentOptions {
  /**
   * A stretch of empty time becomes a break only if it spans at least this
   * fraction of the whole domain.
   */
  minGapRatio?: number;
  /**
   * ...and only if it is also this many times the *typical* gap. Absolute size
   * alone is not enough: on an evenly spread axis of five points every gap is
   * 25% of the domain, and breaking all four would claim time was skipped on a
   * perfectly ordinary linear axis - throwing away the very information that
   * the points are evenly spaced. A break has to be an OUTLIER.
   */
  breakFactor?: number;
  /** Narrowest a break may be drawn; it grows into any leftover width. */
  minGapWidth?: number;
  /** Floor for a span's width, so a zero-duration cluster still gets room. */
  minSpanWidth?: number;
  /**
   * Breaking is only considered once two data points would land closer than
   * this on a plain linear axis. Below that nothing is crowded, and compressing
   * an empty stretch would hide a proportion the reader can judge at a glance -
   * a node registered 18 months ago should *look* 18 months ago when there is
   * room to show it.
   */
  minSeparation?: number;
  /**
   * Inset kept free at each end of a span, so its outermost data point does not
   * sit flush against a break glyph or the frame edge.
   */
  spanMargin?: number;
  /**
   * Width a span needs for its content, given its bounds. Defaults to its
   * duration, which is almost never what a caller wants - see the module note.
   */
  spanWeight?: (from: number, to: number) => number;
}

const DEFAULTS = {
  minGapRatio: 0.12,
  breakFactor: 3,
  minGapWidth: 34,
  minSpanWidth: 48,
  minSeparation: 45,
  spanMargin: 12,
} as const;

/** Linear-interpolated quantile of an unsorted sample. */
function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 1) return s[0];
  const pos = q * (s.length - 1);
  const base = Math.floor(pos);
  const rest = pos - base;
  return base + 1 < s.length ? s[base] + rest * (s[base + 1] - s[base]) : s[base];
}

function sumOf(ns: readonly number[]): number {
  let t = 0;
  for (const n of ns) t += n;
  return t;
}

/**
 * Build a segmented scale over `domain` for the given significant `times`
 * (event times plus any marker such as "now").
 */
export function segmentedTimeScale(
  times: readonly number[],
  domain: readonly [number, number],
  range: readonly [number, number],
  options: SegmentOptions = {},
): SegmentedScale {
  const minGapRatio = options.minGapRatio ?? DEFAULTS.minGapRatio;
  const breakFactor = options.breakFactor ?? DEFAULTS.breakFactor;
  const minGapWidth = options.minGapWidth ?? DEFAULTS.minGapWidth;
  const minSpanWidth = options.minSpanWidth ?? DEFAULTS.minSpanWidth;
  const minSeparation = options.minSeparation ?? DEFAULTS.minSeparation;
  const spanMargin = options.spanMargin ?? DEFAULTS.spanMargin;
  const weigh = options.spanWeight ?? ((from, to) => to - from);

  const [lo, hi] = domain;
  const [r0, r1] = range;
  const totalSpan = hi - lo;
  const totalWidth = r1 - r0;

  const clampTime = (t: number) => Math.min(Math.max(t, lo), hi);

  // Degenerate domain (single instant, or an inverted/zero range): one span, so
  // every time maps to the start and callers need no special case.
  if (!(totalSpan > 0) || !(totalWidth > 0)) {
    const only: TimelineSegment = { kind: "span", from: lo, to: hi, x0: r0, x1: r1 };
    return { segments: [only], at: () => r0, gaps: [], broken: false };
  }

  const linearAt = (t: number) => r0 + ((t - lo) / totalSpan) * totalWidth;
  const asLinear = (): SegmentedScale => ({
    segments: [{ kind: "span", from: lo, to: hi, x0: r0, x1: r1 }],
    at: (t) => linearAt(clampTime(t)),
    gaps: [],
    broken: false,
  });

  // Gate: is a linear axis actually crowded? Only the DATA points count here,
  // not the domain edges a caller padded with.
  const dataPoints = Array.from(
    new Set(times.filter((t) => Number.isFinite(t)).map(clampTime)),
  ).sort((a, b) => a - b);
  let crowded = false;
  for (let i = 1; i < dataPoints.length; i++) {
    if (linearAt(dataPoints[i]) - linearAt(dataPoints[i - 1]) < minSeparation) {
      crowded = true;
      break;
    }
  }
  if (!crowded) return asLinear();

  // Significant times, clamped into the domain, deduplicated, ascending. The
  // edges count too: they bound the first and last span.
  const marks = Array.from(
    new Set([lo, hi, ...times].filter((t) => Number.isFinite(t)).map(clampTime)),
  ).sort((a, b) => a - b);

  const gapSizes: number[] = [];
  for (let i = 1; i < marks.length; i++) gapSizes.push(marks[i] - marks[i - 1]);

  // Both tests must pass: absolutely large, and an outlier among the gaps. The
  // lower quartile stands in for "a typical gap" - a mean or median is dragged
  // upwards by the very outliers being looked for, which with several clusters
  // would hide every break but the largest.
  const threshold = Math.max(
    minGapRatio * totalSpan,
    breakFactor * quantile(gapSizes, 0.25),
  );

  // Group the marks into runs that no break separates, so EVERY mark ends up
  // inside a span. Cutting between marks directly leaves adjacent cuts with no
  // span between them - the axis then consists of breaks only and collapses to
  // their combined width instead of filling the range.
  const groups: number[][] = [[marks[0]]];
  for (let i = 1; i < marks.length; i++) {
    // With a single gap there is nothing to be an outlier against, and breaking
    // an axis that holds two instants tells the reader nothing.
    const isBreak = gapSizes.length >= 2 && marks[i] - marks[i - 1] >= threshold;
    if (isBreak) groups.push([marks[i]]);
    else groups[groups.length - 1].push(marks[i]);
  }

  const draft: Array<{ kind: "span" | "gap"; from: number; to: number }> = [];
  groups.forEach((group, i) => {
    if (i > 0) {
      const previous = groups[i - 1];
      draft.push({ kind: "gap", from: previous[previous.length - 1], to: group[0] });
    }
    draft.push({ kind: "span", from: group[0], to: group[group.length - 1] });
  });

  const spans = draft.filter((d) => d.kind === "span");
  const gapDurations = draft.filter((d) => d.kind === "gap").map((g) => g.to - g.from);
  const gapCount = gapDurations.length;

  // Breaks are only worth their glyph if real width is left for the data.
  if (gapCount === 0 || totalWidth - gapCount * minGapWidth < Math.max(minSpanWidth, totalWidth * 0.3)) {
    return asLinear();
  }

  const needs = spans.map((s) =>
    Math.max(minSpanWidth, Math.max(0, weigh(s.from, s.to)) + 2 * spanMargin),
  );
  const needTotal = sumOf(needs);

  let spanWidths: number[];
  let gapWidths: number[];
  if (needTotal + gapCount * minGapWidth <= totalWidth) {
    // Room to spare: spans take exactly what they need, breaks share the rest
    // in proportion to how much time each one skips, so the widest break stands
    // for the longest silence.
    spanWidths = needs;
    const leftover = totalWidth - needTotal - gapCount * minGapWidth;
    const durationTotal = sumOf(gapDurations) || 1;
    gapWidths = gapDurations.map(
      (d) => minGapWidth + (leftover * d) / durationTotal,
    );
  } else {
    // Tight: breaks shrink to their minimum and the spans share what is left.
    gapWidths = gapDurations.map(() => minGapWidth);
    spanWidths = allocate(needs, totalWidth - gapCount * minGapWidth, minSpanWidth);
  }

  const segments: TimelineSegment[] = [];
  let x = r0;
  let spanIndex = 0;
  let gapIndex = 0;
  for (const piece of draft) {
    const w = piece.kind === "gap" ? gapWidths[gapIndex++] : spanWidths[spanIndex++];
    segments.push({ ...piece, x0: x, x1: x + w });
    x += w;
  }

  return {
    segments,
    at: (t) => positionIn(segments, clampTime(t), spanMargin),
    gaps: segments.filter((s) => s.kind === "gap"),
    broken: true,
  };
}

/**
 * Coordinate of `t` on a segmented axis; linear inside its own segment, inset by
 * `margin` so a span's outermost points keep clear of the seams.
 */
function positionIn(
  segments: readonly TimelineSegment[],
  t: number,
  margin: number,
): number {
  // Spans win ties. A gap's `to` is the next span's `from`, so a mark sitting
  // exactly on a seam belongs to both - and taking the gap put the first point
  // of every cluster on the break glyph itself, which is what made the break
  // look glued to a node.
  const ordered = [...segments].sort((a, b) => Number(a.kind === "gap") - Number(b.kind === "gap"));
  for (const s of ordered) {
    if (t >= s.from && t <= s.to) {
      // Never let the inset exceed the block, or the ends would cross over.
      const inset = Math.min(margin, (s.x1 - s.x0) / 3);
      const a = s.x0 + inset;
      const b = s.x1 - inset;
      const span = s.to - s.from;
      // A zero-duration span (a cluster at one instant) puts everything at its
      // centre, which keeps the dots together instead of on a seam.
      if (!(span > 0)) return (a + b) / 2;
      return a + ((t - s.from) / span) * (b - a);
    }
  }
  return segments.length ? segments[segments.length - 1].x1 : 0;
}

/**
 * Split `total` across `weights` proportionally, but give every share at least
 * `minimum`. Shares pinned to the floor are removed from the pool and the rest
 * re-proportioned, repeatedly, because pinning one share shrinks what the
 * others may take (the same fix-up a treemap or a flex layout needs).
 */
function allocate(
  weights: readonly number[],
  total: number,
  minimum: number,
): number[] {
  const n = weights.length;
  if (n === 0) return [];
  if (total < minimum * n) return new Array(n).fill(total / n);

  const out = new Array<number>(n).fill(0);
  const pinned = new Array<boolean>(n).fill(false);

  for (let pass = 0; pass < n; pass++) {
    const freeIndices = out.map((_, i) => i).filter((i) => !pinned[i]);
    const pool = total - sumOf(out.filter((_, i) => pinned[i]));
    const weightSum = sumOf(freeIndices.map((i) => weights[i]));

    let pinnedThisPass = false;
    for (const i of freeIndices) {
      out[i] = weightSum > 0 ? (weights[i] / weightSum) * pool : pool / freeIndices.length;
      if (out[i] < minimum) {
        out[i] = minimum;
        pinned[i] = true;
        pinnedThisPass = true;
      }
    }
    if (!pinnedThisPass) break;
  }
  return out;
}

/**
 * Estimate the rendered width of an SVG text label.
 *
 * The chart is server-renderable, so there is no `getComputedTextLength` to
 * ask - the layout has to guess before the browser measures. 0.58em per
 * character is a deliberate slight over-estimate for the console's sans stack:
 * over-estimating spreads labels a little too far, under-estimating lets them
 * touch, and only one of those is a bug.
 */
export function estimateTextWidth(label: string, fontSize: number): number {
  return label.length * fontSize * 0.58 + 4;
}

export interface LabelPlacement<T> {
  item: T;
  /** Axis coordinate of the group this label belongs to. */
  x: number;
  /** First row used, 0 = nearest the axis, growing outwards. */
  row: number;
  /** How many consecutive rows the item occupies. */
  rowSpan: number;
  /** Which side of the axis the item sits on. */
  side: "above" | "below";
  /** Text anchor, adjusted so edge labels stay inside the frame. */
  anchor: "start" | "middle" | "end";
  /** Anchor coordinate for the text elements. */
  textX: number;
}

/**
 * Place items so none overlap: walk them left to right and drop each into the
 * first slot whose rows are all free far enough to the left, alternating sides
 * so the rows nearest the axis fill first.
 *
 * Replaces plain `index % 2` alternation, which only ever separates ADJACENT
 * events - with a cluster, events i and i+2 land in the same row at nearly the
 * same x and their labels overlap (measured: 82px of overlap with three events).
 *
 * An item may claim several rows (`rowSpan`), which is how one dot carries the
 * stacked names of everything that falls on the same day.
 */
export function placeLabels<T>(
  items: readonly T[],
  opts: {
    x: (item: T) => number;
    /** Widest label the item will render. */
    width: (item: T) => number;
    /** Rows the item needs; defaults to 1. */
    rowSpan?: (item: T) => number;
    /** Coordinate bounds labels must stay inside. */
    bounds: readonly [number, number];
    /** Minimum horizontal breathing room between two items in a row. */
    gap?: number;
  },
): { placements: Array<LabelPlacement<T>>; rowsAbove: number; rowsBelow: number } {
  const gap = opts.gap ?? 6;
  const [minX, maxX] = opts.bounds;
  const ordered = [...items].sort((a, b) => opts.x(a) - opts.x(b));

  // Rightmost occupied coordinate per row, keyed "above:0", "below:1", ...
  const occupied = new Map<string, number>();
  const placements: Array<LabelPlacement<T>> = [];
  let rowsAbove = 0;
  let rowsBelow = 0;

  for (const item of ordered) {
    const x = opts.x(item);
    const width = opts.width(item);
    const rowSpan = Math.max(1, Math.round(opts.rowSpan?.(item) ?? 1));

    // Edge labels are anchored inwards so they cannot spill out of the frame.
    const anchor: "start" | "middle" | "end" =
      x - width / 2 < minX ? "start" : x + width / 2 > maxX ? "end" : "middle";
    const textX = anchor === "start" ? Math.max(x, minX) : anchor === "end" ? Math.min(x, maxX) : x;
    const left = anchor === "start" ? textX : anchor === "end" ? textX - width : textX - width / 2;
    const right = left + width;

    // First slot whose whole row range is clear, nearest the axis first.
    let row = 0;
    let side: "above" | "below" = "above";
    for (let slot = 0; ; slot++) {
      side = slot % 2 === 0 ? "above" : "below";
      row = Math.floor(slot / 2);
      let fits = true;
      for (let r = row; r < row + rowSpan; r++) {
        const lastRight = occupied.get(`${side}:${r}`);
        if (lastRight !== undefined && left < lastRight + gap) {
          fits = false;
          break;
        }
      }
      if (fits) break;
    }
    for (let r = row; r < row + rowSpan; r++) occupied.set(`${side}:${r}`, right);
    if (side === "above") rowsAbove = Math.max(rowsAbove, row + rowSpan);
    else rowsBelow = Math.max(rowsBelow, row + rowSpan);

    placements.push({ item, x, row, rowSpan, side, anchor, textX });
  }

  return { placements, rowsAbove, rowsBelow };
}
