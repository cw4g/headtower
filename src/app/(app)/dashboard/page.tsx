import * as React from "react";
import Link from "next/link";
import { ArrowRight, RadioTower, ServerOff } from "lucide-react";
import { nodes as nodesApi, users as usersApi } from "@/lib/headscale";
import type { Node, User } from "@/lib/headscale";
import { CoverageView, type CoveragePoint } from "@/components/coverage-view";
import { Surface } from "@/components/ui/surface";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { StatusDot } from "@/components/ui/status-dot";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";

// The dashboard reads live tailnet state on every request; never prerender it.
export const dynamic = "force-dynamic";

const DAY = 86_400_000;
// A key inside this window is "expiring soon" and worth flagging.
const EXPIRY_WINDOW = 14 * DAY;

// --- formatting helpers ----------------------------------------------------

function humanize(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d}d`;
  const w = Math.round(d / 7);
  if (w < 9) return `${w}w`;
  const mo = Math.round(d / 30);
  if (mo < 24) return `${mo}mo`;
  return `${Math.round(d / 365)}y`;
}

function relTime(ts: string): string {
  const diff = new Date(ts).getTime() - Date.now();
  if (Math.abs(diff) < 45_000) return "just now";
  return diff < 0 ? `${humanize(-diff)} ago` : `in ${humanize(diff)}`;
}

function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function nodeName(node: Node): string {
  return node.givenName || node.name || node.id;
}

function userLabel(user: User | undefined): string {
  if (!user) return "—";
  return user.displayName || user.name || user.email || "—";
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

function toAttention(node: Node): AttentionItem | null {
  const base = {
    id: node.id,
    name: nodeName(node),
    user: userLabel(node.user),
  };
  const now = Date.now();
  const expiresAt = node.expiry ? new Date(node.expiry).getTime() : null;

  if (expiresAt !== null && expiresAt <= now) {
    return {
      ...base,
      status: "critical",
      reason: "Key expired",
      detail: `key expired ${relTime(node.expiry as string)}`,
      severity: 0,
    };
  }
  if (!node.online) {
    return {
      ...base,
      status: "warn",
      reason: "Offline",
      detail: node.lastSeen
        ? `last seen ${relTime(node.lastSeen)}`
        : "never seen online",
      severity: 1,
    };
  }
  if (expiresAt !== null && expiresAt - now <= EXPIRY_WINDOW) {
    return {
      ...base,
      status: "warn",
      reason: `Key expires ${relTime(node.expiry as string)}`,
      detail: `expires ${formatDate(node.expiry as string)}`,
      severity: 2,
    };
  }
  return null;
}

// --- view ------------------------------------------------------------------

function Stat({
  label,
  value,
  dot = false,
}: {
  label: string;
  value: React.ReactNode;
  dot?: boolean;
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

export default async function DashboardPage() {
  let nodes: Node[];
  let users: User[];
  try {
    [nodes, users] = await Promise.all([nodesApi.list(), usersApi.list()]);
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
  const onlineCount = nodes.filter((n) => n.online).length;
  const routeSet = new Set<string>();
  for (const n of nodes) for (const r of n.subnetRoutes ?? []) routeSet.add(r);
  const routeCount = routeSet.size;

  const points: CoveragePoint[] = nodes.map((n) => ({
    id: n.id,
    label: nodeName(n),
    online: n.online,
  }));

  const attention = nodes
    .map(toAttention)
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

        <div className="relative">
          <CoverageView points={points} />
          {total === 0 && (
            <p className="data pointer-events-none absolute inset-x-0 bottom-5 text-center text-[11px] uppercase tracking-[0.14em] text-ink-faint">
              Awaiting first device
            </p>
          )}
        </div>
      </Surface>

      {/* Compact readout strip — instrument figures, not stat cards. */}
      <Surface className="grid grid-cols-4 divide-x divide-line">
        <Stat label="Devices" value={total} />
        <Stat label="Online" value={onlineCount} dot />
        <Stat label="Users" value={users.length} />
        <Stat label="Routes" value={routeCount} />
      </Surface>

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

        {total === 0 ? (
          <EmptyState
            icon={RadioTower}
            title="No devices enrolled yet"
            description="Generate a pre-auth key and connect a machine — it will light up on the coverage map as soon as it checks in."
          />
        ) : attention.length === 0 ? (
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
    </div>
  );
}
