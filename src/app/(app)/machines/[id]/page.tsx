import * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Antenna,
  Cpu,
  Fingerprint,
  KeyRound,
  MapPin,
  Network,
  Route as RouteIcon,
  Clock,
  Waypoints,
} from "lucide-react";
import { nodes as nodesApi, HeadscaleRequestError } from "@/lib/headscale";
import type { Node } from "@/lib/headscale";
import { getAgentPeers } from "@/lib/agent";
import { sessionCan } from "@/lib/authz";
import {
  toNodeView,
  nodeDot,
  ownerLabel,
  formatUtc,
  relativeTime,
  nowMs,
  type NodeAgentInfo,
  type NodeView,
} from "@/lib/machines";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Chip, Tag } from "@/components/ui/chip";
import { StatusDot } from "@/components/ui/status-dot";
import { CopyButton } from "@/components/ui/copy-button";
import { ConnectionError } from "@/components/machines/connection-error";
import { NodeActions } from "@/components/machines/node-actions";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

export default async function MachineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let node: Node | null = null;
  let error: unknown = null;
  try {
    node = await nodesApi.get(id);
  } catch (err) {
    if (err instanceof HeadscaleRequestError && err.status === 404) {
      notFound();
    }
    error = err;
  }

  // Day-to-day device ops are gated on machines.write; read-only roles see the
  // detail without the mutating Actions panel.
  const canManage = await sessionCan("machines.write");

  // Best-effort agent enrichment for this node; null when no sidecar matched.
  const agent = node
    ? (await getAgentPeers()).lookup(node.name, node.ipAddresses ?? [])
    : null;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/machines"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Machines
      </Link>

      {error ? (
        <ConnectionError error={error} />
      ) : node ? (
        <MachineDetail node={node} canManage={canManage} agent={agent} />
      ) : null}
    </div>
  );
}

function MachineDetail({
  node,
  canManage,
  agent,
}: {
  node: Node;
  canManage: boolean;
  agent: NodeAgentInfo | null;
}) {
  const now = nowMs();
  const view = toNodeView(node, now, agent);
  const dot = nodeDot(view);

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader view={view} dot={dot} now={now} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <AddressesCard view={view} />
          {view.agent && <SystemCard agent={view.agent} />}
          <RoutesCard view={view} node={node} />
          <IdentityCard node={node} view={view} />
        </div>

        <div className="flex flex-col gap-4">
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardBody>
                <NodeActions
                  nodeId={view.id}
                  name={view.name}
                  tags={view.tags}
                />
              </CardBody>
            </Card>
          )}

          <TimelineCard view={view} now={now} />
        </div>
      </div>
    </div>
  );
}

function DetailHeader({
  view,
  dot,
  now,
}: {
  view: NodeView;
  dot: { status: "online" | "warn" | "critical" | "idle"; label: string };
  now: number;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <StatusDot status={dot.status} pulse={view.online} className="mt-2" />
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight text-ink">
              {view.name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
              {view.hostname !== view.name && (
                <span className="data text-ink-faint">{view.hostname}</span>
              )}
              <span>·</span>
              <span>{ownerLabel(view.user)}</span>
              {view.user.email && (
                <span className="data text-xs text-ink-faint">
                  {view.user.email}
                </span>
              )}
            </div>
          </div>
        </div>

        <span className="data text-xs text-ink-faint">#{view.id}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip variant={view.online ? "online" : "default"}>
          {view.online ? "Online" : "Offline"}
        </Chip>
        {view.expired && <Chip variant="critical">Key expired</Chip>}
        {view.expiresSoon && (
          <Chip variant="warn">Expires {relativeTime(view.expiry, now)}</Chip>
        )}
        {view.isExitNode && (
          <Chip variant="default" className="gap-1">
            <Antenna className="h-3 w-3" aria-hidden />
            Exit node
          </Chip>
        )}
        {view.advertisesExit && (
          <Chip variant="warn" className="gap-1">
            <Antenna className="h-3 w-3" aria-hidden />
            Exit advertised
          </Chip>
        )}
        <Chip variant="default" className="gap-1">
          <KeyRound className="h-3 w-3" aria-hidden />
          {view.registerMethod}
        </Chip>
      </div>
    </div>
  );
}

/* --- Attribute primitives ------------------------------------------------- */

function DataRow({
  label,
  children,
  mono,
  copy,
  title,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  mono?: boolean;
  copy?: string;
  title?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-2.5 last:border-0">
      <span className="shrink-0 pt-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">
        {label}
      </span>
      <span className="flex min-w-0 items-center justify-end gap-1.5">
        <span
          className={cn("truncate text-sm text-ink", mono && "data")}
          title={title}
        >
          {children}
        </span>
        {copy && <CopyButton value={copy} label={`Copy ${typeof label === "string" ? label : "value"}`} />}
      </span>
    </div>
  );
}

function AddressesCard({ view }: { view: NodeView }) {
  const extras = view.addresses.filter(
    (a) => a !== view.ipv4 && a !== view.ipv6,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-ink-faint" aria-hidden />
          Addresses
        </CardTitle>
      </CardHeader>
      <CardBody className="py-1">
        {view.ipv4 ? (
          <DataRow label="IPv4" mono copy={view.ipv4} title={view.ipv4}>
            {view.ipv4}
          </DataRow>
        ) : null}
        {view.ipv6 ? (
          <DataRow label="IPv6" mono copy={view.ipv6} title={view.ipv6}>
            {view.ipv6}
          </DataRow>
        ) : null}
        {extras.map((addr) => (
          <DataRow key={addr} label="Address" mono copy={addr} title={addr}>
            {addr}
          </DataRow>
        ))}
        {view.addresses.length === 0 && (
          <p className="py-2 text-sm text-ink-faint">No addresses assigned.</p>
        )}
      </CardBody>
    </Card>
  );
}

/** Device facts the control plane can't see, contributed by the agent sidecar. */
function SystemCard({ agent }: { agent: NodeAgentInfo }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-ink-faint" aria-hidden />
          System
        </CardTitle>
        <span className="data text-xs text-ink-faint">via agent</span>
      </CardHeader>
      <CardBody className="py-1">
        {agent.os && (
          <DataRow label="OS" mono copy={agent.os} title={agent.os}>
            {agent.os}
          </DataRow>
        )}
        {agent.clientVersion && (
          <DataRow
            label="Client"
            mono
            copy={agent.clientVersion}
            title={agent.clientVersion}
          >
            {agent.clientVersion}
          </DataRow>
        )}
        <div className="flex flex-col gap-1.5 py-2.5">
          <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">
            <Waypoints className="h-3.5 w-3.5" aria-hidden />
            Endpoints
          </span>
          {agent.endpoints.length > 0 ? (
            <div className="flex flex-col gap-1">
              {agent.endpoints.map((endpoint) => (
                <div
                  key={endpoint}
                  className="flex items-center justify-between gap-2"
                >
                  <span
                    className="data truncate text-sm text-ink"
                    title={endpoint}
                  >
                    {endpoint}
                  </span>
                  <CopyButton value={endpoint} label="Copy endpoint" />
                </div>
              ))}
            </div>
          ) : (
            <span className="text-sm text-ink-faint">None reported.</span>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function RoutesCard({ view, node }: { view: NodeView; node: Node }) {
  const exitState = view.isExitNode
    ? { label: "Active", variant: "online" as const }
    : view.advertisesExit
      ? { label: "Advertised, pending approval", variant: "warn" as const }
      : { label: "Not an exit node", variant: "default" as const };

  const approvedCount = (node.approvedRoutes ?? []).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RouteIcon className="h-4 w-4 text-ink-faint" aria-hidden />
          Routes
        </CardTitle>
        <span className="data text-xs text-ink-faint">
          {approvedCount} approved
        </span>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm text-ink-muted">
            <Antenna className="h-4 w-4 text-ink-faint" aria-hidden />
            Exit node
          </span>
          <Chip variant={exitState.variant}>{exitState.label}</Chip>
        </div>

        <RouteGroup
          icon={Network}
          label="Subnet routes served"
          routes={view.subnetRoutes}
          empty="None served."
        />

        {view.pendingRoutes.length > 0 && (
          <RouteGroup
            icon={Network}
            label="Advertised, awaiting approval"
            routes={view.pendingRoutes}
            variant="warn"
          />
        )}
      </CardBody>
    </Card>
  );
}

function RouteGroup({
  icon: Icon,
  label,
  routes,
  empty,
  variant = "neutral",
}: {
  icon: typeof Network;
  label: string;
  routes: string[];
  empty?: string;
  variant?: "neutral" | "warn";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </span>
      {routes.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {routes.map((route) =>
            variant === "warn" ? (
              <Chip key={route} variant="warn" mono>
                {route}
              </Chip>
            ) : (
              <Tag key={route}>{route}</Tag>
            ),
          )}
        </div>
      ) : empty ? (
        <span className="text-sm text-ink-faint">{empty}</span>
      ) : null}
    </div>
  );
}

function IdentityCard({ node, view }: { node: Node; view: NodeView }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fingerprint className="h-4 w-4 text-ink-faint" aria-hidden />
          Identity
        </CardTitle>
      </CardHeader>
      <CardBody className="py-1">
        <DataRow label="Node ID" mono copy={view.id}>
          #{view.id}
        </DataRow>
        <DataRow label="Hostname" mono copy={view.hostname} title={view.hostname}>
          {view.hostname}
        </DataRow>
        <DataRow label="Owner">{ownerLabel(view.user)}</DataRow>
        {view.user.name && (
          <DataRow label="User" mono copy={view.user.name} title={view.user.name}>
            {view.user.name}
          </DataRow>
        )}
        <DataRow label="Registered via">{view.registerMethod}</DataRow>

        <DataRow label="Tags">
          {view.tags.length > 0 || view.invalidTags.length > 0 ? (
            <span className="flex flex-wrap justify-end gap-1.5">
              {view.tags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
              {view.invalidTags.map((tag) => (
                <Chip key={tag} variant="critical" mono title="Rejected by policy">
                  {tag}
                </Chip>
              ))}
            </span>
          ) : (
            <span className="text-ink-faint">untagged</span>
          )}
        </DataRow>

        <KeyRow label="Machine key" value={node.machineKey} />
        <KeyRow label="Node key" value={node.nodeKey} />
        <KeyRow label="Disco key" value={node.discoKey} />

        {node.preAuthKey && (
          <DataRow
            label="Pre-auth key"
            mono
            copy={node.preAuthKey.id}
            title={`Pre-auth key #${node.preAuthKey.id}`}
          >
            #{node.preAuthKey.id}
            {node.preAuthKey.ephemeral ? " · ephemeral" : ""}
            {node.preAuthKey.reusable ? " · reusable" : ""}
          </DataRow>
        )}
      </CardBody>
    </Card>
  );
}

function KeyRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <DataRow label={label} mono copy={value} title={value}>
      <span className="inline-block max-w-[14rem] truncate align-bottom md:max-w-[20rem]">
        {value}
      </span>
    </DataRow>
  );
}

function TimelineCard({ view, now }: { view: NodeView; now: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-ink-faint" aria-hidden />
          Timeline
        </CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <TimeStat
          label="Last seen"
          primary={view.online ? "Connected now" : relativeTime(view.lastSeen, now)}
          secondary={view.online ? "Live session" : formatUtc(view.lastSeen)}
          tone={view.online ? "online" : "default"}
        />
        <TimeStat
          label="First registered"
          primary={relativeTime(view.createdAt, now)}
          secondary={formatUtc(view.createdAt)}
        />
        <TimeStat
          label="Key expiry"
          primary={
            view.expiry
              ? view.expired
                ? "Expired"
                : relativeTime(view.expiry, now)
              : "Never expires"
          }
          secondary={view.expiry ? formatUtc(view.expiry) : "No expiry set"}
          tone={view.expired ? "critical" : view.expiresSoon ? "warn" : "default"}
        />
      </CardBody>
    </Card>
  );
}

function TimeStat({
  label,
  primary,
  secondary,
  tone = "default",
}: {
  label: string;
  primary: string;
  secondary: string;
  tone?: "default" | "online" | "warn" | "critical";
}) {
  const toneClass = {
    default: "text-ink",
    online: "text-online-600",
    warn: "text-warn-500",
    critical: "text-critical-500",
  }[tone];
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">
        {label}
      </span>
      <span className={cn("text-sm font-medium", toneClass)}>{primary}</span>
      <span className="data text-xs text-ink-faint">{secondary}</span>
    </div>
  );
}
