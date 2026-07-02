import * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Fingerprint,
  Mail,
  Server,
  TriangleAlert,
} from "lucide-react";
import { nodes as nodesApi, users as usersApi, type User } from "@/lib/headscale";
import { withoutAgentNodes } from "@/lib/agent-node";
import { sessionCan } from "@/lib/authz";
import { appUser, db, type AppUser } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/rbac";
import {
  toNodeView,
  nodeDot,
  formatUtc,
  relativeTime,
  nowMs,
  type NodeView,
} from "@/lib/machines";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { StatusDot } from "@/components/ui/status-dot";
import { CopyButton } from "@/components/ui/copy-button";
import { describeHeadscaleError } from "../errors";
import { AvatarImage } from "../avatar-image";
import { UserActions } from "../user-actions";
import { cn } from "@/lib/cn";

// A user's owned nodes and account link are live state; never prebuild them.
export const dynamic = "force-dynamic";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let userList: User[] | null = null;
  let rawNodes: Awaited<ReturnType<typeof nodesApi.list>> = [];
  let error: string | null = null;
  try {
    // Headscale has no user-get endpoint, so read the list and pick this id.
    // The node list rides the same connection and feeds the owned-nodes card.
    const [list, allNodes] = await Promise.all([
      usersApi.list(),
      nodesApi.list(),
    ]);
    userList = list;
    rawNodes = allNodes;
  } catch (err) {
    error = describeHeadscaleError(err);
  }

  // Role gating and account enrichment resolve outside the control-plane try:
  // a failed local read shouldn't masquerade as a Headscale outage.
  const canManage = await sessionCan("users.write");
  const accountRows = await loadAccounts();

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <ErrorPanel message={error} />
      </div>
    );
  }

  const user = userList?.find((u) => String(u.id) === id) ?? null;
  if (!user) notFound();

  const now = nowMs();
  const owned = withoutAgentNodes(rawNodes)
    .filter((node) => node.user?.id === user.id)
    .map((node) => toNodeView(node, now, null))
    .sort((a, b) => {
      // Online first, then by name - the operator's reading order.
      if (a.online !== b.online) return a.online ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  const account = matchAccount(user, accountRows);

  return (
    <div className="flex flex-col gap-6">
      <BackLink />

      <DetailHeader
        user={user}
        account={account}
        ownedNodeCount={owned.length}
        canManage={canManage}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <OwnedNodesCard nodes={owned} />
        </div>
        <div className="flex flex-col gap-4">
          <IdentityCard user={user} account={account} now={now} />
        </div>
      </div>
    </div>
  );
}

/** Best-effort read of the local accounts, for OIDC/role enrichment. */
async function loadAccounts(): Promise<AppUser[]> {
  try {
    return await db.select().from(appUser);
  } catch {
    return [];
  }
}

/**
 * Match this tailnet user to the Headtower account that signed in via OIDC as
 * the same person, when one exists - lowercased email first, then name. Mirrors
 * the join the users list makes at render time.
 */
function matchAccount(user: User, accountRows: AppUser[]): AppUser | null {
  const email = user.email?.trim().toLowerCase();
  const names = [user.displayName?.trim().toLowerCase(), user.name?.trim().toLowerCase()];
  for (const account of accountRows) {
    const accEmail = account.email?.trim().toLowerCase();
    if (email && accEmail && accEmail === email) return account;
  }
  for (const account of accountRows) {
    const accName = account.name.trim().toLowerCase();
    if (accName && names.includes(accName)) return account;
  }
  return null;
}

function BackLink() {
  return (
    <Link
      href="/users"
      className="inline-flex w-fit items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Users
    </Link>
  );
}

function DetailHeader({
  user,
  account,
  ownedNodeCount,
  canManage,
}: {
  user: User;
  account: AppUser | null;
  ownedNodeCount: number;
  canManage: boolean;
}) {
  const displayName = user.displayName?.trim() || user.name;
  const showHandle =
    Boolean(user.displayName?.trim()) && user.displayName.trim() !== user.name;
  const provider = user.provider?.trim();
  const src = account?.picture?.trim() || user.profilePicUrl?.trim();

  return (
    <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {src ? (
            <AvatarImage src={src} fallback={initialOf(displayName)} />
          ) : (
            <span
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2 text-xs font-medium text-ink-muted"
            >
              {initialOf(displayName)}
            </span>
          )}
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight text-ink">
              {displayName}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
              {showHandle && (
                <span className="data text-ink-faint">@{user.name}</span>
              )}
              {user.email && (
                <>
                  {showHandle && <span>·</span>}
                  <span className="data text-xs text-ink-faint">{user.email}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {canManage && (
            <UserActions
              userId={user.id}
              name={user.name}
              ownedNodeCount={ownedNodeCount}
              redirectAfterDelete="/users"
            />
          )}
          <span className="data text-xs text-ink-faint">#{user.id}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {account ? (
          // A matched Headtower account: this person signed in via OIDC, a more
          // specific source than whatever Headscale reports for the user.
          <>
            <Chip variant="beacon">SSO</Chip>
            <Chip variant="default">{ROLE_LABELS[account.role]}</Chip>
          </>
        ) : provider ? (
          <Chip mono variant="default">
            {provider}
          </Chip>
        ) : (
          <Chip variant="default">Local user</Chip>
        )}
        <Chip variant="default" className="gap-1">
          <Server className="h-3 w-3" aria-hidden />
          {ownedNodeCount} {ownedNodeCount === 1 ? "node" : "nodes"}
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
        <span className={cn("truncate text-sm text-ink", mono && "data")} title={title}>
          {children}
        </span>
        {copy && (
          <CopyButton
            value={copy}
            label={`Copy ${typeof label === "string" ? label : "value"}`}
          />
        )}
      </span>
    </div>
  );
}

function IdentityCard({
  user,
  account,
  now,
}: {
  user: User;
  account: AppUser | null;
  now: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fingerprint className="h-4 w-4 text-ink-faint" aria-hidden />
          Identity
        </CardTitle>
      </CardHeader>
      <CardBody className="py-1">
        <DataRow label="User ID" mono copy={user.id}>
          #{user.id}
        </DataRow>
        <DataRow label="Username" mono copy={user.name} title={user.name}>
          {user.name}
        </DataRow>
        {user.displayName?.trim() && (
          <DataRow label="Display name" title={user.displayName}>
            {user.displayName}
          </DataRow>
        )}
        <DataRow
          label={
            <span className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" aria-hidden />
              Email
            </span>
          }
          mono
          copy={user.email || undefined}
          title={user.email || undefined}
        >
          {user.email || <span className="text-ink-faint">none</span>}
        </DataRow>
        <DataRow label="Source">
          {account ? (
            `SSO · ${ROLE_LABELS[account.role]}`
          ) : user.provider?.trim() ? (
            <span className="data">{user.provider}</span>
          ) : (
            <span className="text-ink-faint">local</span>
          )}
        </DataRow>
        <DataRow
          label={
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" aria-hidden />
              Created
            </span>
          }
          title={formatUtc(user.createdAt)}
        >
          {user.createdAt ? (
            relativeTime(user.createdAt, now)
          ) : (
            <span className="text-ink-faint">unknown</span>
          )}
        </DataRow>
      </CardBody>
    </Card>
  );
}

/**
 * The nodes this user owns, each linking to its machine detail. Empty when the
 * user has enrolled no devices - the calm resting state for a fresh user.
 */
function OwnedNodesCard({ nodes }: { nodes: NodeView[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-4 w-4 text-ink-faint" aria-hidden />
          Owned nodes
        </CardTitle>
        {nodes.length > 0 && (
          <span className="data text-xs text-ink-faint">{nodes.length}</span>
        )}
      </CardHeader>
      <CardBody className={nodes.length > 0 ? "py-1" : undefined}>
        {nodes.length > 0 ? (
          <ul className="flex flex-col">
            {nodes.map((node) => (
              <OwnedNodeRow key={node.id} node={node} />
            ))}
          </ul>
        ) : (
          <p className="py-2 text-sm text-ink-faint">
            This user owns no nodes. Enrol one with a pre-auth key or interactive
            login.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function OwnedNodeRow({ node }: { node: NodeView }) {
  const dot = nodeDot(node);
  const address = node.ipv4 || node.ipv6;

  return (
    <li className="border-b border-line last:border-0">
      <Link
        href={`/machines/${node.id}`}
        className="group flex items-center gap-3 py-2.5 transition-colors"
      >
        <StatusDot status={dot.status} pulse={node.online} />
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-sm font-medium text-ink transition-colors group-hover:text-beacon-500">
            {node.name}
          </span>
          {node.hostname !== node.name && (
            <span className="data truncate text-xs text-ink-faint">
              {node.hostname}
            </span>
          )}
        </div>
        {address && (
          <span className="data hidden shrink-0 text-xs text-ink-muted sm:inline">
            {address}
          </span>
        )}
        <span
          className="data shrink-0 text-xs text-ink-faint"
          title={node.lastSeen ?? "never"}
        >
          {node.online ? "connected" : node.lastSeenLabel}
        </span>
      </Link>
    </li>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="grid-field flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-critical-500/40 px-6 py-14 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-card border border-critical-500/30 bg-critical-500/10 text-critical-500">
        <TriangleAlert className="h-5 w-5" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ink">Couldn&apos;t load this user</p>
        <p className="mx-auto max-w-sm text-xs text-ink-muted">{message}</p>
      </div>
    </div>
  );
}

/** First character of a label, uppercased; unicode-safe. */
function initialOf(label: string): string {
  const first = Array.from(label.trim())[0] ?? "?";
  return first.toUpperCase();
}
