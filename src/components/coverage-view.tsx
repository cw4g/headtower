/**
 * CoverageView — the dashboard's signature element.
 *
 * A schematic "OS-grouped connection mesh": a control-tower spine runs down the
 * left edge, and every operating system present on the tailnet gets its own
 * horizontal lane branching off it. Each device is a marker on its lane, wired
 * back with a thin line — solid beacon-tinted and a filled dot when online,
 * faint dashed and a hollow dot when not. No rings, no radar: the shape of the
 * fleet is read by scanning lanes top to bottom, the way an operator would scan
 * a patch panel. Server-rendered, colours driven entirely by design tokens.
 */
import * as React from "react";
import Link from "next/link";
import {
  Apple,
  AppWindow,
  CircleHelp,
  Cpu,
  Smartphone,
  SquareTerminal,
  TabletSmartphone,
  type LucideIcon,
} from "lucide-react";
import { BeaconMark } from "@/components/beacon-mark";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/cn";

export interface CoveragePoint {
  id: string;
  /** Friendly node label, shown truncated and in full on hover. */
  label: string;
  online: boolean;
  /**
   * Raw agent-reported OS (e.g. "linux", "darwin", "windows"), if the agent
   * sidecar matched this node. Absent when there is no agent enrichment —
   * every point then normalises into the "unknown" lane.
   */
  os?: string;
}

type OsKey = "linux" | "macos" | "windows" | "ios" | "android" | "freebsd" | "unknown";

/** Lane display order — server platforms first, mobile after, unknown last. */
const OS_ORDER: readonly OsKey[] = [
  "linux",
  "macos",
  "windows",
  "ios",
  "android",
  "freebsd",
  "unknown",
];

const OS_META: Record<OsKey, { label: string; icon: LucideIcon }> = {
  linux: { label: "Linux", icon: SquareTerminal },
  macos: { label: "macOS", icon: Apple },
  windows: { label: "Windows", icon: AppWindow },
  ios: { label: "iOS", icon: Smartphone },
  android: { label: "Android", icon: TabletSmartphone },
  freebsd: { label: "FreeBSD", icon: Cpu },
  unknown: { label: "Unknown", icon: CircleHelp },
};

/** Normalise an agent-reported OS string into one of the fixed lane keys. */
function normalizeOs(raw: string | null | undefined): OsKey {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return "unknown";
  if (v.includes("darwin") || v.includes("mac")) return "macos";
  if (v.includes("linux")) return "linux";
  if (v.includes("windows")) return "windows";
  if (v.includes("ios") || v.includes("iphone") || v.includes("ipad")) return "ios";
  if (v.includes("android")) return "android";
  if (v.includes("freebsd") || v.includes("bsd")) return "freebsd";
  return "unknown";
}

interface Lane {
  key: OsKey;
  label: string;
  icon: LucideIcon;
  nodes: CoveragePoint[];
  onlineCount: number;
}

/** Bucket points by normalised OS, dropping empty lanes and sorting deterministically. */
function groupByOs(points: CoveragePoint[]): Lane[] {
  const buckets = new Map<OsKey, CoveragePoint[]>();
  for (const point of points) {
    const key = normalizeOs(point.os);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(point);
    else buckets.set(key, [point]);
  }
  return OS_ORDER.filter((key) => buckets.has(key)).map((key) => {
    const nodes = [...(buckets.get(key) ?? [])].sort((a, b) =>
      a.online === b.online ? a.label.localeCompare(b.label) : a.online ? -1 : 1,
    );
    const meta = OS_META[key];
    return {
      key,
      label: meta.label,
      icon: meta.icon,
      nodes,
      onlineCount: nodes.filter((n) => n.online).length,
    };
  });
}

/** The short branch connecting a lane back to the spine. Dims when the whole lane is dark. */
function BranchTick({ active }: { active: boolean }) {
  return (
    <svg
      width={16}
      height={14}
      viewBox="0 0 16 14"
      className="shrink-0 overflow-visible"
      aria-hidden
    >
      <line
        x1={0}
        y1={7}
        x2={12}
        y2={7}
        className={active ? "stroke-beacon-500" : "stroke-line"}
        strokeWidth={1.5}
        strokeOpacity={active ? 0.85 : 1}
      />
      <circle
        cx={12}
        cy={7}
        r={2}
        className={active ? "fill-beacon-500" : "fill-line-strong"}
      />
    </svg>
  );
}

/**
 * One device: its wire back into the lane, then the device itself - the
 * lane's OS icon (a real computer/phone shape, not an abstract dot), with a
 * small corner status light for online/offline, and a truncated mono label.
 * The whole marker deep-links to the machine's detail page.
 */
function NodeMarker({ point, icon: Icon }: { point: CoveragePoint; icon: LucideIcon }) {
  const status = point.online ? "online" : "offline";
  return (
    <Link
      href={`/machines/${point.id}`}
      title={`${point.label} · ${status}`}
      className="group -mx-1 -my-0.5 inline-flex min-w-0 items-center gap-1.5 rounded-control px-1 py-0.5 transition-colors hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40"
    >
      <svg width={12} height={14} viewBox="0 0 12 14" className="shrink-0 overflow-visible">
        <line
          x1={0}
          y1={7}
          x2={12}
          y2={7}
          className={point.online ? "stroke-beacon-500" : "stroke-line"}
          strokeWidth={1.25}
          strokeOpacity={point.online ? 0.75 : 1}
          strokeDasharray={point.online ? undefined : "2 2.5"}
        />
      </svg>
      <span className="relative inline-flex shrink-0 items-center justify-center">
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            point.online ? "text-ink" : "text-ink-faint",
          )}
          aria-hidden
        />
        <span
          className={cn(
            "absolute -bottom-0.5 -right-1 h-[7px] w-[7px] rounded-full border border-surface",
            point.online ? "bg-online-500 animate-pulse" : "bg-ink-faint",
          )}
          aria-hidden
        />
      </span>
      <span className="data max-w-[8rem] truncate text-xs text-ink-muted transition-colors group-hover:text-ink sm:max-w-[10rem]">
        {point.label}
      </span>
    </Link>
  );
}

/** One OS lane: the glyph + name + count to the left, devices wired along the track. */
function LaneRow({ lane }: { lane: Lane }) {
  const Icon = lane.icon;
  const hasOnline = lane.onlineCount > 0;
  return (
    <div className="flex items-start gap-3 px-3 py-3 sm:px-4">
      <div className="flex w-32 shrink-0 items-center gap-1.5 pt-0.5 sm:w-36">
        <BranchTick active={hasOnline} />
        <Icon
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            hasOnline ? "text-ink-muted" : "text-ink-faint",
          )}
          aria-hidden
        />
        <span className="data truncate text-[11px] uppercase tracking-[0.12em] text-ink-muted">
          {lane.label}
        </span>
        <Chip
          mono
          className="ml-auto h-[18px] shrink-0 px-1 text-[10px] leading-none"
        >
          {lane.nodes.length}
        </Chip>
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 border-l border-line/70 pl-3 pt-0.5">
        {lane.nodes.map((point) => (
          <NodeMarker key={point.id} point={point} icon={lane.icon} />
        ))}
      </div>
    </div>
  );
}

/** Legend explaining the wire language, plus the running total. */
function CoverageLegend({ total }: { total: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
          <svg width={16} height={10} viewBox="0 0 16 10" aria-hidden>
            <line
              x1={0}
              y1={5}
              x2={9}
              y2={5}
              className="stroke-beacon-500"
              strokeWidth={1.5}
              strokeOpacity={0.75}
            />
            <circle cx={11} cy={5} r={2.25} className="fill-online-500" />
          </svg>
          online
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
          <svg width={16} height={10} viewBox="0 0 16 10" aria-hidden>
            <line
              x1={0}
              y1={5}
              x2={9}
              y2={5}
              className="stroke-line"
              strokeWidth={1.5}
              strokeDasharray="2 2.5"
            />
            <circle
              cx={11}
              cy={5}
              r={2.25}
              className="fill-surface stroke-ink-faint"
              strokeWidth={1.25}
            />
          </svg>
          offline
        </span>
      </div>
      <span className="data text-[11px] text-ink-faint">
        <span className="tabular-nums text-ink">{total}</span> devices total
      </span>
    </div>
  );
}

function EmptyCoverage() {
  return (
    <div
      role="img"
      aria-label="Tailnet coverage map: no devices enrolled"
      className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-6 py-14 text-center"
    >
      <BeaconMark className="h-8 w-8 opacity-30" />
      <p className="data text-[11px] uppercase tracking-[0.14em] text-ink-faint">
        No devices yet
      </p>
    </div>
  );
}

export function CoverageView({ points }: { points: CoveragePoint[] }) {
  const total = points.length;
  if (total === 0) return <EmptyCoverage />;

  const lanes = groupByOs(points);
  const onlineCount = points.filter((p) => p.online).length;

  return (
    <div
      role="img"
      aria-label={`Tailnet coverage map: ${onlineCount} of ${total} devices online across ${lanes.length} operating system${lanes.length === 1 ? "" : "s"}`}
    >
      <div className="flex">
        {/* Control-tower spine: the beacon mark, broadcasting down a single line
            that every lane branches off. */}
        <div className="relative flex w-10 shrink-0 justify-center pt-3 sm:w-12">
          <BeaconMark className="z-10 h-6 w-6 shrink-0 sm:h-7 sm:w-7" />
          <span
            aria-hidden
            className="absolute top-9 bottom-3 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-beacon-500/70 via-beacon-500/25 to-beacon-500/5 sm:top-10"
          />
        </div>

        {/* OS lanes, one per platform present on the tailnet. */}
        <div className="max-h-[26rem] min-w-0 flex-1 divide-y divide-line overflow-y-auto">
          {lanes.map((lane) => (
            <LaneRow key={lane.key} lane={lane} />
          ))}
        </div>
      </div>

      <CoverageLegend total={total} />
    </div>
  );
}
