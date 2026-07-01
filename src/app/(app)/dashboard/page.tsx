import * as React from "react";
import Link from "next/link";
import { ArrowRight, RadioTower, ServerOff } from "lucide-react";
import { nodes as nodesApi, users as usersApi } from "@/lib/headscale";
import type { Node, User } from "@/lib/headscale";
import { getAgentPeers } from "@/lib/agent";
import { withoutAgentNodes } from "@/lib/agent-node";
import {
  toNodeView,
  nowMs,
  ownerLabel,
  relativeTime,
  type NodeView,
} from "@/lib/machines";
import { cn } from "@/lib/cn";
import { CoverageView, type CoveragePoint } from "@/components/coverage-view";
import {
  BarChart,
  Donut,
  Sparkline,
  Timeline,
  type BarDatum,
  type ChartTone,
  type DonutSlice,
  type TimelineEvent,
} from "@/components/charts";
import { OnlineTrend } from "@/components/dashboard/online-trend";
import { Surface } from "@/components/ui/surface";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { StatusDot } from "@/components/ui/status-dot";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { captureTailnetSnapshot, type SnapshotPoint } from "./actions";

// The dashboard reads live tailnet state on every request; never prerender it.
export const dynamic = "force-dynamic";

const DAY = 86_400_000;
// Key expiries older than this (already lapsed) or further out drop off the
// upcoming-expiry timeline so it stays readable.
const EXPIRY_PAST_WINDOW = 14 * DAY;
const EXPIRY_FUTURE_WINDOW = 180 * DAY;
// Cap the timeline so a large tailnet can't crowd the axis.
const MAX_EXPIRY_EVENTS = 14;

// --- formatting helpers ----------------------------------------------------

function formatDay(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function nodeName(node: Node): string {
  return node.givenName || node.name || node.id;
}

// --- attention model -------------------------------------------------------

type AttentionStatus = "warn" | "critical";

interface AttentionItem {
  id: string;
  name: string;
  user: string;
  status: AttentionStatus;
  reason: string;
  detail: string;
  /** Lower sorts first: expired key, then offline, then expiring soon. */
  severity: number;
}

function toAttention(view: NodeView, now: number): AttentionItem | null {
  const base = { id: view.id, name: view.name, user: ownerLabel(view.user) };

  if (view.expired) {
    return {
      ...base,
      status: "critical",
      reason: "Key expired",
      detail: `key expired ${relativeTime(view.expiry, now)}`,
      severity: 0,
    };
  }
  if (!view.online) {
    return {
      ...base,
      status: "warn",
      reason: "Offline",
      detail: view.lastSeen
        ? `last seen ${view.lastSeenLabel}`
        : "never seen online",
      severity: 1,
    };
  }
  if (view.expiresSoon) {
    return {
      ...base,
      status: "warn",
      reason: `Key expires ${relativeTime(view.expiry, now)}`,
      detail: `expires ${formatDay(view.expiry)}`,
      severity: 2,
    };
  }
  return null;
}

// --- widget data ------------------------------------------------------------

interface Distribution {
  title: string;
  slices: DonutSlice[];
}

/** Top `max` categories by count as un-toned slices, the rest folded to "Other". */
function topSlices(counts: Map<string, number>, max = 5): DonutSlice[] {
  const entries = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const slices: DonutSlice[] = entries
    .slice(0, max)
    .map(([label, value]) => ({ label, value }));
  const other = entries.slice(max).reduce((s, [, v]) => s + v, 0);
  if (other > 0) slices.push({ label: "Other", value: other, tone: "neutral" });
  return slices;
}

/**
 * Device distribution for the platforms donut. Prefers agent-reported operating
 * systems; with no agent enrichment it falls back to how nodes registered, which
 * Headscale always knows - so the widget is populated either way.
 */
function platformDistribution(views: NodeView[]): Distribution {
  const os = new Map<string, number>();
  for (const view of views) {
    const label = view.agent?.os?.trim();
    if (label) os.set(label, (os.get(label) ?? 0) + 1);
  }
  if (os.size > 0) return { title: "Operating systems", slices: topSlices(os) };

  const reg = new Map<string, number>();
  for (const view of views) {
    reg.set(view.registerMethod, (reg.get(view.registerMethod) ?? 0) + 1);
  }
  return { title: "Registration", slices: topSlices(reg) };
}

interface BarWidget {
  title: string;
  bars: BarDatum[];
}

/**
 * Bars for the routing widget. Prefers nodes serving routes (subnet routes plus
 * an exit route), falling back to tag usage, then to nothing - so the widget
 * shows the most operationally interesting thing available.
 */
function routingBars(views: NodeView[]): BarWidget | null {
  const routers = views
    .map((view) => ({
      name: view.name,
      count: view.subnetRoutes.length + (view.isExitNode ? 1 : 0),
    }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 6);
  if (routers.length > 0) {
    return {
      title: "Routes served",
      bars: routers.map((r) => ({ label: r.name, value: r.count })),
    };
  }

  const tags = new Map<string, number>();
  for (const view of views) {
    for (const tag of view.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
  }
  if (tags.size > 0) {
    const bars = [...tags.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([label, value]) => ({ label, value }));
    return { title: "Tag usage", bars };
  }

  return null;
}

/** Upcoming (and just-lapsed) key expiries as timeline events, nearest first. */
function expiryEvents(views: NodeView[], now: number): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const view of views) {
    if (!view.expiry) continue;
    const t = Date.parse(view.expiry);
    if (Number.isNaN(t)) continue;
    if (t < now - EXPIRY_PAST_WINDOW || t > now + EXPIRY_FUTURE_WINDOW) continue;
    const tone: ChartTone = view.expired
      ? "critical"
      : view.expiresSoon
        ? "warn"
        : "neutral";
    events.push({
      id: view.id,
      label: view.name,
      time: t,
      tone,
      detail: view.expired ? "expired" : "key expires",
    });
  }
  return events.sort((a, b) => a.time - b.time).slice(0, MAX_EXPIRY_EVENTS);
}

// --- view primitives -------------------------------------------------------

function Widget({
  label,
  right,
  className,
  bodyClassName,
  children,
}: {
  label: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Surface className={cn("flex flex-col overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <span className="data text-[11px] uppercase tracking-[0.14em] text-ink-faint">
          {label}
        </span>
        {right}
      </div>
      <div className={cn("flex flex-1 flex-col p-4", bodyClassName)}>
        {children}
      </div>
    </Surface>
  );
}

function WidgetNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex flex-1 items-center justify-center px-2 py-8 text-center text-xs text-ink-faint">
      {children}
    </p>
  );
}

function Stat({
  label,
  value,
  dot = false,
  trend,
  trendTone = "beacon",
}: {
  label: string;
  value: React.ReactNode;
  dot?: boolean;
  trend?: number[];
  trendTone?: ChartTone;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-4 py-4 sm:px-6 sm:py-5">
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
        {dot && (
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-online-500"
            aria-hidden
          />
        )}
        {label}
      </span>
      <span className="data text-2xl font-semibold tabular-nums text-ink sm:text-[2.5rem] sm:leading-none">
        {value}
      </span>
      {trend && trend.length >= 2 && (
        <Sparkline
          data={trend}
          tone={trendTone}
          area
          showEnd={false}
          className="mt-1.5 h-5 opacity-70"
        />
      )}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Surface className="flex flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-card border border-critical-500/30 bg-critical-500/10 text-critical-500">
        <ServerOff className="h-5 w-5" aria-hidden />
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-ink">Control plane unreachable</p>
        <p className="mx-auto max-w-md text-xs text-ink-muted">
          Headtower could not read tailnet state from Headscale. Confirm{" "}
          <span className="data text-ink-muted">HEADSCALE_URL</span> and{" "}
          <span className="data text-ink-muted">HEADSCALE_API_KEY</span> are set
          and that the control plane is reachable.
        </p>
      </div>
      <p className="data max-w-lg break-words text-xs text-critical-500">
        {message}
      </p>
    </Surface>
  );
}

export const metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const now = nowMs();

  let nodes: Node[];
  let users: User[];
  let views: NodeView[];
  try {
    // Agent enrichment is best-effort and fails quiet, so fetch it alongside the
    // tailnet state; an absent sidecar just yields an empty index.
    const [rawNodeList, userList, agents] = await Promise.all([
      nodesApi.list(),
      usersApi.list(),
      getAgentPeers(),
    ]);
    // The agent's own tailnet node is infrastructure, not a device — hide it
    // from coverage, counts, and the attention feed.
    const nodeList = withoutAgentNodes(rawNodeList);
    nodes = nodeList;
    users = userList;
    views = nodeList.map((node) =>
      toNodeView(node, now, agents.lookup(node.name, node.ipAddresses ?? [])),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return (
      <div className="flex flex-col gap-6">
        <SectionHeading
          eyebrow="Control tower"
          title="Dashboard"
          description="Live coverage and status across your tailnet."
        />
        <ErrorState message={message} />
      </div>
    );
  }

  const total = nodes.length;
  const onlineCount = views.filter((v) => v.online).length;
  const routeSet = new Set<string>();
  for (const n of nodes) for (const r of n.subnetRoutes ?? []) routeSet.add(r);
  const routeCount = routeSet.size;

  // Record a throttled snapshot and read back the recent history for the trend.
  // Best-effort: an unavailable store yields an empty history and the trend
  // widgets degrade to "not enough data yet".
  const history: SnapshotPoint[] = await captureTailnetSnapshot({
    total,
    online: onlineCount,
    users: users.length,
  });
  const hasTrend = history.length >= 2;
  const onlineTrend = history.map((h) => h.online);
  const totalTrend = history.map((h) => h.total);

  // Agent-reported OS, keyed by node id, so the coverage view can group by
  // platform without reshaping the raw Node list it's otherwise built from.
  const agentOsById = new Map<string, string | undefined>();
  for (const v of views) agentOsById.set(v.id, v.agent?.os ?? undefined);

  const points: CoveragePoint[] = nodes.map((n) => ({
    id: n.id,
    label: nodeName(n),
    online: n.online,
    os: agentOsById.get(n.id),
  }));

  const platforms = platformDistribution(views);
  const routing = routingBars(views);
  const expiries = expiryEvents(views, now);

  const connectivity: DonutSlice[] = [
    { label: "Online", value: onlineCount, tone: "online" },
    { label: "Offline", value: total - onlineCount, tone: "neutral" },
  ];

  const attention = views
    .map((v) => toAttention(v, now))
    .filter((a): a is AttentionItem => a !== null)
    .sort((a, b) => a.severity - b.severity || a.name.localeCompare(b.name));
  const shown = attention.slice(0, 6);
  const overflow = attention.length - shown.length;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        eyebrow="Control tower"
        title="Dashboard"
        description="Live coverage and status across your tailnet."
      />

      {/* Signature: the tailnet coverage view. */}
      <Surface grid className="relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <span className="data text-[11px] uppercase tracking-[0.14em] text-beacon-500">
            Tailnet coverage
          </span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-xs text-ink-muted">
              <span
                className="inline-block h-2 w-2 rounded-full bg-online-500"
                aria-hidden
              />
              <span className="data tabular-nums text-ink">{onlineCount}</span>
              online
            </span>
            <span className="flex items-center gap-1.5 text-xs text-ink-muted">
              <span
                className="inline-block h-2 w-2 rounded-full border border-ink-faint"
                aria-hidden
              />
              <span className="data tabular-nums text-ink">
                {total - onlineCount}
              </span>
              offline
            </span>
          </div>
        </div>

        <CoverageView points={points} />
      </Surface>

      {/* Compact readout strip — instrument figures, not stat cards. */}
      <Surface className="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-4 sm:divide-y-0">
        <Stat label="Devices" value={total} trend={hasTrend ? totalTrend : undefined} trendTone="neutral" />
        <Stat label="Online" value={onlineCount} dot trend={hasTrend ? onlineTrend : undefined} trendTone="online" />
        <Stat label="Users" value={users.length} />
        <Stat label="Routes" value={routeCount} />
      </Surface>

      {total === 0 ? (
        <EmptyState
          icon={RadioTower}
          title="No devices enrolled yet"
          description="Generate a pre-auth key and connect a machine — it will light up on the coverage map as soon as it checks in."
        />
      ) : (
        <>
          {/* Widget grid — trend, distributions, routing. */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Widget label="Online over time" className="lg:col-span-2">
              {hasTrend ? (
                <OnlineTrend
                  points={history.map((h) => ({
                    ts: h.ts,
                    online: h.online,
                    total: h.total,
                  }))}
                />
              ) : (
                <WidgetNote>
                  Trend appears once Headtower has logged a few snapshots — one is
                  recorded each visit, at most every 5 minutes.
                </WidgetNote>
              )}
            </Widget>

            <Widget label="Connectivity" bodyClassName="items-center justify-center">
              <Donut
                data={connectivity}
                size={148}
                centerValue={total}
                centerLabel="devices"
                aria-label={`Connectivity: ${onlineCount} online, ${total - onlineCount} offline`}
              />
            </Widget>

            <Widget label={platforms.title} bodyClassName="items-center justify-center">
              {platforms.slices.length > 0 ? (
                <Donut
                  data={platforms.slices}
                  size={148}
                  centerLabel="devices"
                />
              ) : (
                <WidgetNote>No device platform data.</WidgetNote>
              )}
            </Widget>

            <Widget
              label={routing?.title ?? "Routing"}
              className="lg:col-span-2"
              bodyClassName="justify-center"
            >
              {routing ? (
                <BarChart orientation="horizontal" data={routing.bars} />
              ) : (
                <WidgetNote>
                  No subnet routes, exit nodes, or tags in use yet.
                </WidgetNote>
              )}
            </Widget>
          </div>

          {/* Upcoming key expiries. */}
          <Widget label="Key expiry">
            {expiries.length > 0 ? (
              <Timeline
                events={expiries}
                now={now}
                start={Math.min(now, expiries[0].time) - DAY}
                end={Math.max(now + 7 * DAY, expiries[expiries.length - 1].time) + DAY}
              />
            ) : (
              <WidgetNote>
                No key expiries scheduled in the next{" "}
                {Math.round(EXPIRY_FUTURE_WINDOW / DAY)} days.
              </WidgetNote>
            )}
          </Widget>

          {/* Needs attention. */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-medium text-ink">
                Needs attention
                {attention.length > 0 && (
                  <Chip mono variant="warn">
                    {attention.length}
                  </Chip>
                )}
              </h2>
              <Link
                href="/machines"
                className="flex items-center gap-1 text-xs text-ink-muted transition-colors hover:text-ink"
              >
                All machines
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>

            {attention.length === 0 ? (
              <Card>
                <div className="flex items-center gap-2.5 px-4 py-5 text-sm text-ink-muted">
                  <StatusDot status="online" pulse />
                  All devices online — no keys expiring soon.
                </div>
              </Card>
            ) : (
              <Card>
                <ul>
                  {shown.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-0"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <StatusDot
                          status={item.status === "critical" ? "critical" : "warn"}
                        />
                        <div className="min-w-0">
                          <div className="data truncate text-sm text-ink">
                            {item.name}
                          </div>
                          <div className="truncate text-xs text-ink-faint">
                            {item.user} · {item.detail}
                          </div>
                        </div>
                      </div>
                      <Chip
                        variant={item.status === "critical" ? "critical" : "warn"}
                      >
                        {item.reason}
                      </Chip>
                    </li>
                  ))}
                </ul>
                {overflow > 0 && (
                  <div className="border-t border-line px-4 py-2.5">
                    <Link
                      href="/machines"
                      className="data text-xs text-ink-muted transition-colors hover:text-ink"
                    >
                      +{overflow} more
                    </Link>
                  </div>
                )}
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}
