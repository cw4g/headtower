/**
 * CoverageView — the dashboard's signature element.
 *
 * A schematic "tailnet coverage" radar: the control tower (the beacon glyph)
 * sits at the centre, broadcasting; every node is a point arranged on concentric
 * range rings around it. Online nodes are placed on the inner rings with a faint
 * signal line back to the tower (within coverage); offline nodes sit faint on the
 * outer ring (weak / no signal). Pure SVG, no chart library — server-rendered,
 * colours driven by the design tokens so it flips with the theme.
 */
import * as React from "react";

export interface CoveragePoint {
  id: string;
  /** Friendly node label, shown on hover via <title>. */
  label: string;
  online: boolean;
}

// Viewport. Wide instrument panel; the tower is dead centre.
const VW = 1200;
const VH = 525;
const CX = VW / 2;
const CY = VH / 2;
// Vertical squash: rings are ellipses so the radar fills a wide panel.
const K = 0.46;

// Range-ring radii (x). Online → inner two, offline → third, fourth is the
// decorative coverage boundary.
const RINGS = [160, 300, 440, 560] as const;

interface PlacedPoint extends CoveragePoint {
  x: number;
  y: number;
}

/** Spread `items` evenly by angle around one elliptical ring. */
function placeOnRing(
  items: CoveragePoint[],
  rx: number,
  rotateDeg: number,
): PlacedPoint[] {
  const n = items.length;
  if (n === 0) return [];
  const ry = rx * K;
  const step = 360 / n;
  return items.map((item, i) => {
    const a = ((rotateDeg + step * i) * Math.PI) / 180;
    return {
      ...item,
      x: CX + rx * Math.cos(a),
      y: CY + ry * Math.sin(a),
    };
  });
}

function layout(points: CoveragePoint[]): {
  online: PlacedPoint[];
  offline: PlacedPoint[];
} {
  // Stable ordering so the radar is deterministic across renders.
  const sorted = [...points].sort((a, b) => a.label.localeCompare(b.label));
  const online = sorted.filter((p) => p.online);
  const offline = sorted.filter((p) => !p.online);

  let onlinePlaced: PlacedPoint[];
  if (online.length <= 6) {
    onlinePlaced = placeOnRing(online, RINGS[1], -90);
  } else {
    const innerN = Math.ceil(online.length * 0.4);
    const inner = online.slice(0, innerN);
    const outer = online.slice(innerN);
    onlinePlaced = [
      ...placeOnRing(inner, RINGS[0], -90),
      ...placeOnRing(outer, RINGS[1], -90 + 360 / outer.length / 2),
    ];
  }

  return {
    online: onlinePlaced,
    offline: placeOnRing(offline, RINGS[2], -90 + 18),
  };
}

export function CoverageView({ points }: { points: CoveragePoint[] }) {
  const { online, offline } = layout(points);
  const onlineCount = online.length;
  const total = points.length;

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-[clamp(260px,40vw,440px)] w-full"
      role="img"
      aria-label={
        total === 0
          ? "Tailnet coverage map: no devices enrolled"
          : `Tailnet coverage map: ${onlineCount} of ${total} devices online`
      }
    >
      {/* Range rings — concentric, faint, the outer two dashed. */}
      {RINGS.map((rx, i) => (
        <ellipse
          key={rx}
          cx={CX}
          cy={CY}
          rx={rx}
          ry={rx * K}
          className="fill-none stroke-line"
          strokeWidth={1}
          strokeOpacity={0.75 - i * 0.14}
          strokeDasharray={i >= 2 ? "2 7" : undefined}
        />
      ))}

      {/* Faint schematic guide axes through the tower. */}
      <line
        x1={CX - RINGS[3]}
        y1={CY}
        x2={CX + RINGS[3]}
        y2={CY}
        className="stroke-line"
        strokeOpacity={0.4}
        strokeWidth={1}
      />
      <line
        x1={CX}
        y1={CY - RINGS[3] * K}
        x2={CX}
        y2={CY + RINGS[3] * K}
        className="stroke-line"
        strokeOpacity={0.4}
        strokeWidth={1}
      />

      {/* Sonar sweep: the tower's signal washing out across the range rings.
          Two staggered pulses for a continuous wash; paused under
          prefers-reduced-motion via the global motion floor. */}
      {total > 0 &&
        [0, 1].map((i) => (
          <ellipse
            key={`sweep-${i}`}
            cx={CX}
            cy={CY}
            rx={120}
            ry={120 * K}
            className="coverage-sweep fill-none stroke-beacon-500"
            strokeWidth={1.5}
            style={{ animationDelay: `${i * 2.75}s` }}
          />
        ))}

      {/* Signal lines: the tower's light reaching each online node. */}
      {online.map((p) => (
        <line
          key={`sig-${p.id}`}
          x1={CX}
          y1={CY}
          x2={p.x}
          y2={p.y}
          className="stroke-beacon-500"
          strokeOpacity={0.16}
          strokeWidth={1}
        />
      ))}

      {/* Offline nodes: hollow, faint — out of coverage, weak signal. */}
      {offline.map((p) => (
        <g key={p.id} opacity={0.55}>
          <circle
            cx={p.x}
            cy={p.y}
            r={4.5}
            className="fill-surface stroke-ink-faint"
            strokeWidth={1.5}
          />
          <title>{`${p.label} · offline`}</title>
        </g>
      ))}

      {/* Online nodes: solid, with a soft signal halo. */}
      {online.map((p) => (
        <g key={p.id}>
          <circle
            cx={p.x}
            cy={p.y}
            r={10}
            className="fill-online-500"
            fillOpacity={0.14}
          />
          <circle cx={p.x} cy={p.y} r={5} className="fill-online-500" />
          <title>{`${p.label} · online`}</title>
        </g>
      ))}

      {/* The control tower at centre, broadcasting. */}
      <g>
        {/* Broadcast pulse — motion that reports the control plane is live. */}
        <ellipse
          cx={CX}
          cy={CY}
          rx={92}
          ry={92 * K}
          className="fill-none stroke-beacon-500 animate-pulse"
          strokeOpacity={0.35}
          strokeWidth={1}
        />
        {/* Soft glow. */}
        <circle
          cx={CX}
          cy={CY}
          r={40}
          className="fill-beacon-500"
          fillOpacity={0.1}
        />
        {/* Housing: the dark brand square. */}
        <rect
          x={CX - 26}
          y={CY - 26}
          width={52}
          height={52}
          rx={13}
          className="fill-graphite-900 stroke-line-strong"
          strokeWidth={1.5}
        />
        {/* The beacon mark: cone of light + amber signal dot. */}
        <g transform={`translate(${CX - 20} ${CY - 20}) scale(${40 / 256})`}>
          <path
            d="M128 92 L180 196 L76 196 Z"
            className="fill-ink-faint"
            fillOpacity={0.55}
          />
          <circle cx={128} cy={74} r={20} className="fill-beacon-500" />
        </g>
      </g>
    </svg>
  );
}
