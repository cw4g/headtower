import * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Antenna,
  Cpu,
  Fingerprint,
  History,
  KeyRound,
  MapPin,
  Network,
  NotebookPen,
  Radio,
  Route as RouteIcon,
  Waypoints,
} from "lucide-react";
import {
  nodes as nodesApi,
  users as usersApi,
  HeadscaleRequestError,
} from "@/lib/headscale";
import type { Node } from "@/lib/headscale";
import { getAgentPeers } from "@/lib/agent";
import { sessionCan } from "@/lib/authz";
import { listAudit, type AuditEntry } from "@/lib/audit";
import {
  getNodeMetadata,
  getNodeMetadataMap,
  hasMetadata,
  EMPTY_NODE_METADATA,
  type NodeMetadataValue,
} from "@/lib/db";
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
import { Sparkline, Timeline, type TimelineEvent } from "@/components/charts";
import {
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  CardFooter,
} from "@/components/ui/card";
import { Chip, Tag } from "@/components/ui/chip";
import { StatusDot } from "@/components/ui/status-dot";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConnectionError } from "@/components/machines/connection-error";
import { NodeActionsMenu } from "@/components/machines/node-actions-menu";
import { TerminalAction } from "@/components/machines/terminal-action";
import type { UserOption } from "@/components/machines/add-device-dialog-lazy";
import {
  NodeMetadataDialog,
  EnvironmentBadge,
  NodeLabelChips,
} from "@/components/machines/node-metadata-dialog";
import { humanizeAction, summarizeDetail } from "../../audit/format";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

/** Trailing window, in days, for the per-node activity sparkline. */
const ACTIVITY_DAYS = 14;
const DAY_MS = 86_400_000;

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

  // A stable const so the closures below narrow cleanly to a non-null Node.
  const found = node;

  // Enrichment and gating resolve concurrently: role (for the Actions panel
  // and the Terminal action), the optional agent sidecar (device facts), and
  // this node's audit history.
  const [canManage, canSsh, agent, nodeAudit, metadata, labelSuggestions, users] =
    await Promise.all([
      sessionCan("machines.write"),
      sessionCan("ssh.connect"),
      found
        ? getAgentPeers().then((peers) =>
            peers.lookup(found.name, found.ipAddresses ?? []),
          )
        : Promise.resolve<NodeAgentInfo | null>(null),
      found ? loadNodeAudit(found.id) : Promise.resolve<AuditEntry[]>([]),
      found
        ? getNodeMetadata(found.id)
        : Promise.resolve<NodeMetadataValue>(EMPTY_NODE_METADATA),
      found ? loadFleetLabels() : Promise.resolve<string[]>([]),
      // The user list feeds the Move owner action. Best-effort, like the agent
      // sidecar: if it fails the action just isn't offered, not the whole page.
      found ? loadUserOptions() : Promise.resolve<UserOption[]>([]),
    ]);

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
      ) : found ? (
        <MachineDetail
          node={found}
          canManage={canManage}
          canSsh={canSsh}
          agent={agent}
          audit={nodeAudit}
          metadata={metadata}
          labelSuggestions={labelSuggestions}
          users={users}
        />
      ) : null}
    </div>
  );
}

/**
 * Read this node's slice of the audit trail. Node mutations (rename, tag,
 * expire, route approval, ...) all record `targetType: "node"` with the node id
 * as `targetId`, so we pull the recent node page and keep the matching rows.
 * Best-effort: a flaky local store yields an empty list, never a failed render.
 */
async function loadNodeAudit(nodeId: string): Promise<AuditEntry[]> {
  try {
    const page = await listAudit({ targetType: "node", limit: 200 });
    return page.entries.filter((entry) => entry.targetId === nodeId);
  } catch {
    return [];
  }
}

/**
 * Every label already in use across the fleet, offered as autocomplete in the
 * metadata dialog so operators converge on a shared vocabulary. Best-effort: an
 * unavailable local store just yields no suggestions.
 */
async function loadFleetLabels(): Promise<string[]> {
  try {
    const map = await getNodeMetadataMap();
    const labels = new Set<string>();
    for (const value of map.values()) {
      for (const label of value.labels) labels.add(label);
    }
    return [...labels].sort();
  } catch {
    return [];
  }
}

/**
 * The tailnet's users as owner options for the Move owner action, shaped like
 * the Add device dialog's list. Best-effort: an unreachable control plane just
 * yields no options, and the action is withheld rather than failing the page.
 */
async function loadUserOptions(): Promise<UserOption[]> {
  try {
    const allUsers = await usersApi.list();
    return allUsers.map((user) => ({
      id: user.id,
      label: user.displayName?.trim() || user.name,
      handle: user.name,
    }));
  } catch {
    return [];
  }
}

function MachineDetail({
  node,
  canManage,
  canSsh,
  agent,
  audit,
  metadata,
  labelSuggestions,
  users,
}: {
  node: Node;
  canManage: boolean;
  canSsh: boolean;
  agent: NodeAgentInfo | null;
  audit: AuditEntry[];
  metadata: NodeMetadataValue;
  labelSuggestions: string[];
  users: UserOption[];
}) {
  const now = nowMs();
  const view = toNodeView(node, now, agent);
  const dot = nodeDot(view);
  const activity = activityByDay(audit, now);
  const sshHost = view.ipv4 || view.ipv6 || view.hostname || null;

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        view={view}
        dot={dot}
        now={now}
        canManage={canManage}
        canSsh={canSsh}
        sshHost={sshHost}
        ownerId={node.user?.id ?? ""}
        users={users}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <MetadataCard
            nodeId={view.id}
            name={view.name}
            metadata={metadata}
            canManage={canManage}
            labelSuggestions={labelSuggestions}
          />
          <AddressesCard view={view} />
          {view.agent && <SystemCard agent={view.agent} />}
          <RoutesCard view={view} node={node} />
          <LifecycleCard node={node} view={view} now={now} />
          <IdentityCard view={view} />
        </div>

        <div className="flex flex-col gap-4">
          <ConnectivityCard view={view} dot={dot} now={now} />
          <ActivityCard entries={audit} activity={activity} now={now} />
        </div>
      </div>
    </div>
  );
}

function DetailHeader({
  view,
  dot,
  now,
  canManage,
  canSsh,
  sshHost,
  ownerId,
  users,
}: {
  view: NodeView;
  dot: { status: "online" | "warn" | "critical" | "idle"; label: string };
  now: number;
  canManage: boolean;
  canSsh: boolean;
  sshHost: string | null;
  ownerId: string;
  users: UserOption[];
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

        <div className="flex items-center gap-3">
          {canSsh && sshHost && <TerminalAction id={view.id} name={view.name} />}
          {canManage && (
            <NodeActionsMenu
              nodeId={view.id}
              name={view.name}
              tags={view.tags}
              ownerId={ownerId}
              users={users}
              redirectAfterDelete="/machines"
            />
          )}
          <span className="data text-xs text-ink-faint">#{view.id}</span>
        </div>
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

/** Small vertical stat: label, primary readout, secondary mono detail. */
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

/** Uppercase micro-heading used to label a section inside a card body. */
function FieldLabel({
  icon: Icon,
  children,
}: {
  icon?: typeof Network;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
      {children}
    </span>
  );
}

/**
 * Headtower-local annotations: an operator note, a deployment environment, and
 * free labels. Explicitly NOT control-plane state - the footer says so - so the
 * card reads as "Headtower's own view of this node." Operators with
 * `machines.write` get the edit dialog; everyone else sees a read-only card.
 */
function MetadataCard({
  nodeId,
  name,
  metadata,
  canManage,
  labelSuggestions,
}: {
  nodeId: string;
  name: string;
  metadata: NodeMetadataValue;
  canManage: boolean;
  labelSuggestions: string[];
}) {
  const present = hasMetadata(metadata);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <NotebookPen className="h-4 w-4 text-ink-faint" aria-hidden />
          Metadata
        </CardTitle>
        {canManage && present && (
          <NodeMetadataDialog
            nodeId={nodeId}
            name={name}
            metadata={metadata}
            labelSuggestions={labelSuggestions}
          />
        )}
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {present ? (
          <>
            {metadata.environment && (
              <div className="flex items-center justify-between gap-3">
                <FieldLabel>Environment</FieldLabel>
                <EnvironmentBadge environment={metadata.environment} />
              </div>
            )}
            {metadata.note && (
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Note</FieldLabel>
                <p className="whitespace-pre-wrap break-words text-sm text-ink-muted">
                  {metadata.note}
                </p>
              </div>
            )}
            {metadata.labels.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Labels</FieldLabel>
                <NodeLabelChips labels={metadata.labels} />
              </div>
            )}
            <p className="text-xs text-ink-faint">
              Stored in Headtower, not pushed to Headscale.
            </p>
          </>
        ) : (
          <EmptyState
            icon={NotebookPen}
            className="py-8"
            title="No metadata yet"
            description="Add an operator note, an environment, or labels. Stored in Headtower only - never pushed to Headscale."
            action={
              canManage ? (
                <NodeMetadataDialog
                  nodeId={nodeId}
                  name={name}
                  metadata={metadata}
                  labelSuggestions={labelSuggestions}
                />
              ) : undefined
            }
          />
        )}
      </CardBody>
    </Card>
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
        {agent.osVersion && (
          <DataRow
            label="OS version"
            mono
            copy={agent.osVersion}
            title={agent.osVersion}
          >
            {agent.osVersion}
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
          <FieldLabel icon={Waypoints}>Endpoints</FieldLabel>
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

        {/* Headscale reports served routes only on the node LIST endpoint, so here
            `subnetRoutes` is empty even for a working subnet router. Falling back
            to the approved set keeps the statement true instead of claiming none. */}
        {view.subnetRoutes.length > 0 ? (
          <RouteGroup
            icon={Network}
            label="Subnet routes served"
            routes={view.subnetRoutes}
          />
        ) : (
          <RouteGroup
            icon={Network}
            label="Subnet routes approved"
            routes={view.approvedSubnets}
            empty="None."
          />
        )}

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
      <FieldLabel icon={Icon}>{label}</FieldLabel>
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

/**
 * Key material and expiry, anchored by a lifecycle Timeline that plots the node
 * from registration through its last contact to key expiry, with a "now" marker.
 */
function LifecycleCard({
  node,
  view,
  now,
}: {
  node: Node;
  view: NodeView;
  now: number;
}) {
  const { events, start, end } = lifecycleEvents(view, now);
  const expiryTag = view.expired
    ? "expired"
    : view.expiry
      ? "active"
      : "no expiry";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-ink-faint" aria-hidden />
          Keys &amp; expiry
        </CardTitle>
        <span className="data text-xs text-ink-faint">{expiryTag}</span>
      </CardHeader>
      <CardBody className="flex flex-col gap-5">
        <Timeline
          events={events}
          start={start}
          end={end}
          now={now}
          formatTime={fmtDayUtc}
          aria-label="Node key lifecycle: registration, last contact, expiry"
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            tone={
              view.expired ? "critical" : view.expiresSoon ? "warn" : "default"
            }
          />
        </div>

        <div className="flex flex-col">
          <div className="mb-1">
            <FieldLabel icon={Fingerprint}>Key material</FieldLabel>
          </div>
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
        </div>
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

function IdentityCard({ view }: { view: NodeView }) {
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
      </CardBody>
    </Card>
  );
}

/** Reachability at a glance: current state, last contact, register method. */
function ConnectivityCard({
  view,
  dot,
  now,
}: {
  view: NodeView;
  dot: { status: "online" | "warn" | "critical" | "idle"; label: string };
  now: number;
}) {
  const reach = view.online
    ? { label: "Reachable", variant: "online" as const }
    : view.expired
      ? { label: "Key expired", variant: "critical" as const }
      : { label: "Offline", variant: "default" as const };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-ink-faint" aria-hidden />
          Connectivity
        </CardTitle>
        <StatusDot status={dot.status} pulse={view.online} />
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <TimeStat
          label="Last seen"
          primary={
            view.online ? "Connected now" : relativeTime(view.lastSeen, now)
          }
          secondary={view.online ? "Live session" : formatUtc(view.lastSeen)}
          tone={view.online ? "online" : "default"}
        />
        <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
          <FieldLabel>Reachability</FieldLabel>
          <Chip variant={reach.variant}>{reach.label}</Chip>
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * Per-node operator history: a 14-day activity sparkline over the recorded
 * actions, then the most recent entries. Graceful when the node has never been
 * touched (or the audit store is unavailable) — both collapse to a quiet note.
 */
function ActivityCard({
  entries,
  activity,
  now,
}: {
  entries: AuditEntry[];
  activity: number[];
  now: number;
}) {
  const windowCount = activity.reduce((total, n) => total + n, 0);
  const recent = entries.slice(0, 6);
  const total = entries.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-4 w-4 text-ink-faint" aria-hidden />
          Recent activity
        </CardTitle>
        {total > 0 && (
          <span className="data text-xs text-ink-faint">{total}</span>
        )}
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {windowCount > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <FieldLabel>{ACTIVITY_DAYS}-day trend</FieldLabel>
              <span className="data text-xs text-ink-muted">
                {windowCount} {windowCount === 1 ? "event" : "events"}
              </span>
            </div>
            <Sparkline
              data={activity}
              tone="beacon"
              area
              className="h-10"
              aria-label={`Console activity over ${ACTIVITY_DAYS} days, ${windowCount} events`}
            />
          </div>
        )}

        {recent.length > 0 ? (
          <ul className="flex flex-col">
            {recent.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} now={now} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-faint">
            No recorded actions for this node yet.
          </p>
        )}
      </CardBody>
      {total > recent.length && (
        <CardFooter>
          <Link
            href="/audit?targetType=node"
            className="text-xs font-medium text-beacon-500 transition-colors hover:text-beacon-400"
          >
            Full audit trail →
          </Link>
        </CardFooter>
      )}
    </Card>
  );
}

function ActivityRow({ entry, now }: { entry: AuditEntry; now: number }) {
  const date = entry.ts instanceof Date ? entry.ts : new Date(entry.ts);
  const iso = Number.isNaN(date.getTime()) ? null : date.toISOString();
  const detail = summarizeDetail(entry.detail);

  return (
    <li className="flex flex-col gap-0.5 border-b border-line py-2.5 last:border-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-ink">{humanizeAction(entry.action)}</span>
        <span
          className="data shrink-0 text-xs text-ink-faint"
          title={iso ? formatUtc(iso) : undefined}
        >
          {relativeTime(iso, now)}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-ink-faint">
        <span className="data truncate">{entry.actor}</span>
        {detail && (
          <>
            <span aria-hidden>·</span>
            <span className="data truncate" title={detail}>
              {detail}
            </span>
          </>
        )}
      </div>
    </li>
  );
}

/* --- Derivations ---------------------------------------------------------- */

/**
 * Bucket this node's audit entries into a trailing `ACTIVITY_DAYS` daily series,
 * oldest → newest (so it feeds a left-to-right sparkline). Entries outside the
 * window are ignored; the result is all-zero when nothing recent is recorded.
 */
function activityByDay(entries: AuditEntry[], now: number): number[] {
  const buckets = new Array<number>(ACTIVITY_DAYS).fill(0);
  for (const entry of entries) {
    const t =
      entry.ts instanceof Date ? entry.ts.getTime() : new Date(entry.ts).getTime();
    if (!Number.isFinite(t)) continue;
    const idx = Math.floor((now - t) / DAY_MS);
    if (idx >= 0 && idx < ACTIVITY_DAYS) buckets[ACTIVITY_DAYS - 1 - idx] += 1;
  }
  return buckets;
}

/**
 * Lifecycle events for the key Timeline: registration, last contact (only while
 * offline — a live node's last contact is "now"), and key expiry, toned by
 * health. The axis is padded around the events and "now" so the marker always
 * lands inside the frame even when every event clusters together.
 */
function lifecycleEvents(
  view: NodeView,
  now: number,
): { events: TimelineEvent[]; start: number; end: number } {
  const events: TimelineEvent[] = [];
  const stamps: number[] = [now];

  const created = view.createdAt ? Date.parse(view.createdAt) : NaN;
  if (!Number.isNaN(created)) {
    events.push({
      id: "created",
      label: "Registered",
      time: created,
      tone: "neutral",
      detail: formatUtc(view.createdAt),
    });
    stamps.push(created);
  }

  if (view.lastSeen && !view.online) {
    const seen = Date.parse(view.lastSeen);
    if (!Number.isNaN(seen)) {
      events.push({
        id: "seen",
        label: "Last seen",
        time: seen,
        tone: "neutral",
        detail: formatUtc(view.lastSeen),
      });
      stamps.push(seen);
    }
  }

  if (view.expiry) {
    const exp = Date.parse(view.expiry);
    if (!Number.isNaN(exp)) {
      events.push({
        id: "expiry",
        label: view.expired ? "Key expired" : "Key expiry",
        time: exp,
        tone: view.expired ? "critical" : view.expiresSoon ? "warn" : "online",
        detail: formatUtc(view.expiry),
      });
      stamps.push(exp);
    }
  }

  const lo = Math.min(...stamps);
  const hi = Math.max(...stamps);
  const pad = Math.max((hi - lo) * 0.06, 60_000);
  return { events, start: lo - pad, end: hi + pad };
}

/** Deterministic UTC "Mon D" tick label, matching the console's UTC discipline. */
const MONTHS_UTC = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function fmtDayUtc(t: number): string {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS_UTC[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
