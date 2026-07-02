import * as React from "react";
import Link from "next/link";
import { ArrowRight, RadioTower, ServerOff } from "lucide-react";
import {
  nodes as nodesApi,
  preAuthKeys as preAuthKeysApi,
  users as usersApi,
} from "@/lib/headscale";
import type { Node, PreAuthKey, User } from "@/lib/headscale";
import { getAgentHealth, getAgentPeers } from "@/lib/agent";
import { withoutAgentNodes } from "@/lib/agent-node";
import { getConfig } from "@/lib/config";
import { listAudit, type AuditEntry } from "@/lib/audit";
import { sessionCan } from "@/lib/authz";
import {
  agentOsLabel,
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
import { DeviceBreakdown } from "@/components/dashboard/device-breakdown";
import { ExpiringSoon, type ExpiringItem } from "@/components/dashboard/expiring-soon";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { AgentWidget } from "@/components/dashboard/agent-widget";
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

// The "Expiring soon" widget uses its own, tighter lookahead than the timeline
// above - it exists to flag what needs renewing this week, not to chart the
// whole upcoming schedule. Past-side it reuses EXPIRY_PAST_WINDOW so a
// long-lapsed, forgotten key doesn't linger in the list forever.
const EXPIRING_SOON_WINDOW = 7 * DAY;
const MAX_EXPIRING_ITEMS = 8;

// How many audit entries the Recent activity feed shows - a glance, not the
// full trail (see /audit for that).
const RECENT_ACTIVITY_LIMIT = 8;

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

/**
 * Agent-reported OS counts, as bar rows (nearest-value `topSlices` also serves
 * a bar chart - both share the same `{ label, value, tone? }` shape). Unlike
 * {@link platformDistribution}, this never falls back to registration method:
 * it exists specifically to show what the agent knows, so an empty result
 * means "no agent data", which the caller renders as its own hint.
 */
function osBreakdown(views: NodeView[]): BarDatum[] {
  const counts = new Map<string, number>();
  for (const view of views) {
    const label = agentOsLabel(view.agent)?.trim();
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return topSlices(counts, 8);
}

/** Agent-reported Tailscale/client version counts, as bar rows. */
function versionBreakdown(views: NodeView[]): BarDatum[] {
  const counts = new Map<string, number>();
  for (const view of views) {
    const label = view.agent?.clientVersion?.trim();
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return topSlices(counts, 8);
}

/** The DeviceBreakdown empty-state copy, tailored to why there's nothing to show. */
function breakdownHint(agentEnabled: boolean, noun: string): string {
  return agentEnabled
    ? `No agent-reported ${noun} yet. It appears once a device checks in.`
    : `Turn on the agent below to see ${noun} here.`;
}

/**
 * Node keys and pre-auth keys expiring within {@link EXPIRING_SOON_WINDOW}, or
 * already lapsed within {@link EXPIRY_PAST_WINDOW} - a tighter, credential-
 * focused sibling of the "Needs attention" list below, which is device-focused
 * and doesn't cover pre-auth keys at all. Expired-first, then soonest-first.
 */
function expiringSoon(
  views: NodeView[],
  keys: PreAuthKey[],
  now: number,
): ExpiringItem[] {
  const items: (ExpiringItem & { time: number })[] = [];

  for (const view of views) {
    if (!view.expiry) continue;
    const t = Date.parse(view.expiry);
    if (Number.isNaN(t)) continue;
    if (t < now - EXPIRY_PAST_WINDOW || t > now + EXPIRING_SOON_WINDOW) continue;
    items.push({
      id: `node:${view.id}`,
      kind: "Node key",
      label: view.name,
      owner: ownerLabel(view.user),
      detail: `${view.expired ? "expired" : "expires"} ${relativeTime(view.expiry, now)}`,
      expired: view.expired,
      // Node keys map to a real machine; pre-auth keys below don't get one
      // since there's no per-key detail route to send them to.
      href: `/machines/${view.id}`,
      time: t,
    });
  }

  for (const key of keys) {
    // A single-use key that's already been consumed has nothing left to renew;
    // its expiry is no longer an operator's problem.
    if (key.used && !key.reusable) continue;
    if (!key.expiration) continue;
    const t = Date.parse(key.expiration);
    if (Number.isNaN(t)) continue;
    if (t < now - EXPIRY_PAST_WINDOW || t > now + EXPIRING_SOON_WINDOW) continue;
    const expired = t <= now;
    items.push({
      id: `key:${key.id}`,
      kind: "Pre-auth key",
      label: `#${key.id}`,
      owner: ownerLabel(key.user),
      detail: `${expired ? "expired" : "expires"} ${relativeTime(key.expiration, now)}`,
      expired,
      time: t,
    });
  }

  return items
    .sort((a, b) => (a.expired === b.expired ? a.time - b.time : a.expired ? -1 : 1))
    .slice(0, MAX_EXPIRING_ITEMS);
}

/**
 * Read the most recent audit entries for the dashboard's activity feed.
 * Best-effort, same contract as {@link captureTailnetSnapshot}: an unavailable
 * local store (e.g. no database in this deployment) degrades to an empty feed
 * rather than failing the page.
 */
async function recentAuditEntries(limit: number): Promise<AuditEntry[]> {
  try {
    const page = await listAudit({ limit });
    return page.entries;
  } catch {
    return [];
  }
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
  href,
}: {
  label: string;
  value: React.ReactNode;
  dot?: boolean;
  trend?: number[];
  trendTone?: ChartTone;
  /** When set, the whole tile deep-links to the matching pre-filtered view. */
  href?: string;
}) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
        {dot && (
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-online-500"
            aria-hidden
          />
        )}
        {label}
        {href && (
          <ArrowRight
            className="h-3 w-3 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        )}
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
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group flex flex-col gap-1.5 px-4 py-4 transition-colors hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-beacon-500/40 sm:px-6 sm:py-5"
      >
        {body}
      </Link>
    );
  }

  return <div className="flex flex-col gap-1.5 px-4 py-4 sm:px-6 sm:py-5">{body}</div>;
}

function ErrorState({ message }: { message: string }) {
  return (
    <EmptyState
      tone="critical"
      icon={ServerOff}
      title="Control plane unreachable"
      description={
        <>
          Headtower could not read tailnet state from Headscale. Confirm{" "}
          <span className="data text-ink-muted">HEADSCALE_URL</span> and{" "}
          <span className="data text-ink-muted">HEADSCALE_API_KEY</span> are set
          and that the control plane is reachable.
        </>
      }
      action={
        <p className="data max-w-lg break-words text-xs text-critical-500">
          {message}
        </p>
      }
    />
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
  let preAuthKeyList: PreAuthKey[];
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

    // Pre-auth keys for the "Expiring soon" widget - the full set across
    // every user.
    preAuthKeyList = await preAuthKeysApi.listAll({ users: userList });
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

  const osBars = osBreakdown(views);
  const versionBars = versionBreakdown(views);
  const expiringItems = expiringSoon(views, preAuthKeyList, now);

  // Agent status + recent activity are independent of tailnet size, so they're
  // read now that the control-plane fetch above has already succeeded. Neither
  // call can throw: getAgentHealth() and sessionCan() report "unavailable" /
  // "no" as values, and recentAuditEntries() is its own best-effort wrapper.
  const agentConfig = getConfig().agent;
  const [agentHealth, canWriteSettings, recentActivity] = await Promise.all([
    getAgentHealth(),
    sessionCan("settings.write"),
    recentAuditEntries(RECENT_ACTIVITY_LIMIT),
  ]);

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
            <Link
              href="/machines?status=online"
              className="flex items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-ink"
            >
              <span
                className="inline-block h-2 w-2 rounded-full bg-online-500"
                aria-hidden
              />
              <span className="data tabular-nums text-ink">{onlineCount}</span>
              online
            </Link>
            <Link
              href="/machines?status=offline"
              className="flex items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-ink"
            >
              <span
                className="inline-block h-2 w-2 rounded-full border border-ink-faint"
                aria-hidden
              />
              <span className="data tabular-nums text-ink">
                {total - onlineCount}
              </span>
              offline
            </Link>
          </div>
        </div>

        <CoverageView points={points} />
      </Surface>

      {/* Compact readout strip — instrument figures, not stat cards. */}
      <Surface className="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-4 sm:divide-y-0">
        <Stat
          label="Devices"
          value={total}
          href="/machines"
          trend={hasTrend ? totalTrend : undefined}
          trendTone="neutral"
        />
        <Stat
          label="Online"
          value={onlineCount}
          dot
          href="/machines?status=online"
          trend={hasTrend ? onlineTrend : undefined}
          trendTone="online"
        />
        <Stat label="Users" value={users.length} href="/users" />
        <Stat label="Routes" value={routeCount} href="/routes" />
      </Surface>

      {/* Agent sidecar: health readout + on/off, independent of tailnet size. */}
      <Widget label="Agent">
        <AgentWidget
          health={agentHealth}
          configured={agentConfig.url !== null}
          enabled={agentConfig.enabled}
          canWrite={canWriteSettings}
        />
      </Widget>

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

            <Widget label="Connectivity" bodyClassName="items-center justify-center gap-4">
              <Donut
                data={connectivity}
                size={148}
                centerValue={total}
                centerLabel="devices"
                legend={false}
                aria-label={`Connectivity: ${onlineCount} online, ${total - onlineCount} offline`}
              />
              {/* Own legend, in place of Donut's, so each segment deep-links
                  to its slice of the machines list. */}
              <ul className="flex min-w-0 flex-col gap-1.5">
                {connectivity.map((slice) => (
                  <li key={slice.label}>
                    <Link
                      href={`/machines?status=${slice.label === "Online" ? "online" : "offline"}`}
                      className="flex items-center gap-2 rounded-control px-1.5 py-1 text-xs transition-colors hover:bg-surface-2/60"
                    >
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-[2px]",
                          slice.tone === "online" ? "bg-online-500" : "bg-ink/50",
                        )}
                        aria-hidden
                      />
                      <span className="truncate text-ink-muted">{slice.label}</span>
                      <span className="data ml-auto pl-3 text-ink">{slice.value}</span>
                      <span className="data w-9 text-right text-ink-faint">
                        {total > 0 ? `${Math.round((slice.value / total) * 100)}%` : "—"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
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

          {/* Agent-reported device mix, degrading to a hint when the agent is
              off or hasn't reported in yet. */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Widget label="Operating systems">
              <DeviceBreakdown
                bars={osBars}
                emptyHint={breakdownHint(agentConfig.enabled, "operating systems")}
              />
            </Widget>
            <Widget label="Client versions">
              <DeviceBreakdown
                bars={versionBars}
                emptyHint={breakdownHint(agentConfig.enabled, "client versions")}
              />
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

          {/* Node keys and pre-auth keys due for renewal this week. */}
          <Widget label="Expiring soon">
            <ExpiringSoon items={expiringItems} />
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
                    <li key={item.id} className="border-b border-line last:border-0">
                      <Link
                        href={`/machines/${item.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-beacon-500/40"
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
                      </Link>
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

      {/* Recent activity: local operator history, independent of tailnet size. */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-ink">Recent activity</h2>
          <Link
            href="/audit"
            className="flex items-center gap-1 text-xs text-ink-muted transition-colors hover:text-ink"
          >
            Full audit trail
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
        <Card>
          <RecentActivity entries={recentActivity} now={now} />
        </Card>
      </section>
    </div>
  );
}
