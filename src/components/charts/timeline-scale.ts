/**
 * Segmented time scale for the Timeline chart — pure, dependency-free, and
 * unit-tested separately from the SVG that draws it.
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
 * comparison the chart exists for (both call sites deliberately pad the domain
 * so the marker stays in frame). Zooming to the events only moves the problem
 * when there are SEVERAL clusters - the gaps between them are then blank
 * instead.
 *
 * So the axis is cut into segments instead: "span" segments carry the clusters
 * and get width proportional to their duration, "gap" segments stand for the
 * skipped emptiness and get a fixed narrow width, drawn with a break glyph and
 * labelled with what was skipped. Time inside a span stays strictly linear, so
 * positions within a cluster remain honest; only the marked breaks are
 * compressed.
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
   * fraction of the whole domain. Below that, compressing it would cost more
   * legibility (an unexplained glyph) than it buys.
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
  /** Coordinate width each break is compressed to. */
  gapWidth?: number;
  /** Floor for a span's width, so a zero-duration cluster still gets room. */
  minSpanWidth?: number;
  /**
   * Breaking is only considered once two data points would land closer than
   * this on a plain linear axis. Below that threshold nothing is crowded, and
   * compressing an empty stretch would only hide a proportion the reader can
   * judge at a glance - a node registered 18 months ago should *look* 18 months
   * ago when there is room to show it.
   */
  minSeparation?: number;
}

const DEFAULTS = {
  minGapRatio: 0.12,
  breakFactor: 3,
  gapWidth: 26,
  minSpanWidth: 48,
  minSeparation: 45,
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

/**
 * Build a segmented scale over `domain` for the given significant `times`
 * (event times plus any marker such as "now").
 *
 * Empty stretches between consecutive significant times are candidates for a
 * break; everything else is kept linear. The domain edges are honoured, so a
 * caller's padding around the data is preserved.
 */
export function segmentedTimeScale(
  times: readonly number[],
  domain: readonly [number, number],
  range: readonly [number, number],
  options: SegmentOptions = {},
): SegmentedScale {
  const minGapRatio = options.minGapRatio ?? DEFAULTS.minGapRatio;
  const breakFactor = options.breakFactor ?? DEFAULTS.breakFactor;
  const gapWidth = options.gapWidth ?? DEFAULTS.gapWidth;
  const minSpanWidth = options.minSpanWidth ?? DEFAULTS.minSpanWidth;
  const minSeparation = options.minSeparation ?? DEFAULTS.minSeparation;

  const [lo, hi] = domain;
  const [r0, r1] = range;
  const totalSpan = hi - lo;
  const totalWidth = r1 - r0;

  // Degenerate domain (single instant, or an inverted/zero range): one span, so
  // every time maps to the start and callers need no special case.
  if (!(totalSpan > 0) || !(totalWidth > 0)) {
    const only: TimelineSegment = { kind: "span", from: lo, to: hi, x0: r0, x1: r1 };
    return { segments: [only], at: () => r0, gaps: [], broken: false };
  }

  // Significant times, clamped into the domain, deduplicated, ascending. The
  // edges count too: they bound the first and last span.
  const marks = Array.from(
    new Set(
      [lo, hi, ...times]
        .filter((t) => Number.isFinite(t))
        .map((t) => Math.min(Math.max(t, lo), hi)),
    ),
  ).sort((a, b) => a - b);

  const linearAt = (t: number) => r0 + ((t - lo) / totalSpan) * totalWidth;

  // Gate: is a linear axis actually crowded? Only the DATA points count here,
  // not the domain edges a caller padded with - two isolated marks far apart
  // read perfectly well on a straight axis, and breaking between them would
  // trade real information for a glyph.
  const dataPoints = Array.from(
    new Set(
      times.filter((t) => Number.isFinite(t)).map((t) => Math.min(Math.max(t, lo), hi)),
    ),
  ).sort((a, b) => a - b);
  let crowded = false;
  for (let i = 1; i < dataPoints.length; i++) {
    if (linearAt(dataPoints[i]) - linearAt(dataPoints[i - 1]) < minSeparation) {
      crowded = true;
      break;
    }
  }
  if (!crowded) {
    const linear: TimelineSegment = { kind: "span", from: lo, to: hi, x0: r0, x1: r1 };
    return {
      segments: [linear],
      at: (t) => linearAt(Math.min(Math.max(t, lo), hi)),
      gaps: [],
      broken: false,
    };
  }

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
  const gapCount = draft.length - spans.length;

  // Breaks are only worth their glyph if real width is left for the data. When
  // they would eat the chart, fall back to a plain linear axis rather than
  // rendering something unreadable.
  const widthForSpans = totalWidth - gapCount * gapWidth;
  if (gapCount === 0 || widthForSpans < Math.max(minSpanWidth, totalWidth * 0.35)) {
    const linear: TimelineSegment = { kind: "span", from: lo, to: hi, x0: r0, x1: r1 };
    return {
      segments: [linear],
      at: (t) => r0 + ((Math.min(Math.max(t, lo), hi) - lo) / totalSpan) * totalWidth,
      gaps: [],
      broken: false,
    };
  }

  const widths = allocate(
    spans.map((s) => s.to - s.from),
    widthForSpans,
    minSpanWidth,
  );

  const segments: TimelineSegment[] = [];
  let x = r0;
  let spanIndex = 0;
  for (const piece of draft) {
    const w = piece.kind === "gap" ? gapWidth : widths[spanIndex++];
    segments.push({ ...piece, x0: x, x1: x + w });
    x += w;
  }

  return {
    segments,
    at: (t) => positionIn(segments, Math.min(Math.max(t, lo), hi)),
    gaps: segments.filter((s) => s.kind === "gap"),
    broken: true,
  };
}

/** Coordinate of `t` on a segmented axis; linear inside its own segment. */
function positionIn(segments: readonly TimelineSegment[], t: number): number {
  for (const s of segments) {
    if (t >= s.from && t <= s.to) {
      const span = s.to - s.from;
      // A zero-duration span (a cluster at one instant) puts everything at its
      // centre, which keeps the dots together instead of on the seam.
      if (!(span > 0)) return (s.x0 + s.x1) / 2;
      return s.x0 + ((t - s.from) / span) * (s.x1 - s.x0);
    }
  }
  // Only reachable for a time in no segment (shouldn't happen after clamping).
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

  // Not enough room to honour the floor everywhere: split evenly and let the
  // caller's label layout cope. Better a cramped chart than a negative width.
  if (total < minimum * n) return new Array(n).fill(total / n);

  const out = new Array<number>(n).fill(0);
  const pinned = new Array<boolean>(n).fill(false);

  for (let pass = 0; pass < n; pass++) {
    const freeIndices = out.map((_, i) => i).filter((i) => !pinned[i]);
    const pool = total - sumOf(out.filter((_, i) => pinned[i]));
    const weightSum = sumOf(freeIndices.map((i) => weights[i]));

    let pinnedThisPass = false;
    for (const i of freeIndices) {
      // All-zero weights (every cluster an instant) share the pool evenly.
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

function sumOf(ns: readonly number[]): number {
  let t = 0;
  for (const n of ns) t += n;
  return t;
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
  /** Axis coordinate of the event. */
  x: number;
  /** 0 = nearest the axis, growing outwards. */
  row: number;
  /** Which side of the axis the label sits on. */
  side: "above" | "below";
  /** Text anchor, adjusted so edge labels stay inside the frame. */
  anchor: "start" | "middle" | "end";
  /** Anchor coordinate for the text element. */
  textX: number;
}

/**
 * Place labels so none overlap: walk events left to right and drop each into
 * the first row whose last label ends far enough to the left, alternating sides
 * so the row nearest the axis fills first.
 *
 * Replaces plain `index % 2` alternation, which only ever separates ADJACENT
 * events - with a cluster, events i and i+2 land in the same row at nearly the
 * same x and their labels overlap (measured: 82px of overlap with three events).
 */
export function placeLabels<T>(
  items: readonly T[],
  opts: {
    x: (item: T) => number;
    label: (item: T) => string;
    fontSize: number;
    /** Coordinate bounds labels must stay inside. */
    bounds: readonly [number, number];
    /** Minimum horizontal breathing room between two labels in a row. */
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
    const width = estimateTextWidth(opts.label(item), opts.fontSize);

    // Edge labels are anchored inwards so they cannot spill out of the frame.
    const anchor: "start" | "middle" | "end" =
      x - width / 2 < minX ? "start" : x + width / 2 > maxX ? "end" : "middle";
    const textX = anchor === "start" ? Math.max(x, minX) : anchor === "end" ? Math.min(x, maxX) : x;
    const left = anchor === "start" ? textX : anchor === "end" ? textX - width : textX - width / 2;
    const right = left + width;

    // First free row, nearest the axis first, alternating sides.
    let row = 0;
    let side: "above" | "below" = "above";
    for (let slot = 0; ; slot++) {
      side = slot % 2 === 0 ? "above" : "below";
      row = Math.floor(slot / 2);
      const key = `${side}:${row}`;
      const lastRight = occupied.get(key);
      if (lastRight === undefined || left >= lastRight + gap) break;
    }
    occupied.set(`${side}:${row}`, right);
    if (side === "above") rowsAbove = Math.max(rowsAbove, row + 1);
    else rowsBelow = Math.max(rowsBelow, row + 1);

    placements.push({ item, x, row, side, anchor, textX });
  }

  return { placements, rowsAbove, rowsBelow };
}
