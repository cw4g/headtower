import Link from "next/link";
import { ChevronRight, TriangleAlert, UsersRound } from "lucide-react";
import { nodes, users, type User } from "@/lib/headscale";
import { withoutAgentNodes } from "@/lib/agent-node";
import { sessionCan } from "@/lib/authz";
import { appUser, db, type AppUser } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/rbac";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  Table,
  TableBody,
  TableHead,
  Td,
  Th,
  Tr,
} from "@/components/ui/table";
import { AddUserDialog } from "./add-user-dialog";
import { describeHeadscaleError } from "./errors";
import { AvatarImage } from "./avatar-image";
import { UserActions } from "./user-actions";

// The tailnet is live state: always render against the control plane, never a
// build-time snapshot.
export const dynamic = "force-dynamic";

interface UsersData {
  list: User[];
  /** Node count per user id, or null when the node list couldn't be read. */
  nodeCounts: Map<string, number> | null;
  /** The Headtower account (if any) that signed in via OIDC as this tailnet user. */
  accounts: Map<string, AppUser>;
}

async function loadUsers(): Promise<UsersData> {
  const list = await users.list();

  // Node counts are best-effort: a healthy user list shouldn't be withheld just
  // because the node read failed. Null signals "unavailable" to the table.
  let nodeCounts: Map<string, number> | null = null;
  try {
    // The agent's own tailnet node is infrastructure, not a user's device —
    // exclude it from per-user tallies.
    const nodeList = withoutAgentNodes(await nodes.list());
    nodeCounts = new Map();
    for (const node of nodeList) {
      const ownerId = node.user?.id;
      if (!ownerId) continue;
      nodeCounts.set(ownerId, (nodeCounts.get(ownerId) ?? 0) + 1);
    }
  } catch {
    nodeCounts = null;
  }

  // Account enrichment is best-effort too: a healthy tailnet user list
  // shouldn't be withheld just because the local account read failed.
  let accountRows: AppUser[] = [];
  try {
    accountRows = await db.select().from(appUser);
  } catch {
    accountRows = [];
  }
  const accounts = matchAccounts(list, accountRows);

  return { list, nodeCounts, accounts };
}

/**
 * Match each Headscale (tailnet) user to the Headtower account that signed in
 * via OIDC as that same person, when one exists.
 *
 * Headscale has no idea Headtower's OIDC accounts exist - the two are joined
 * here, at render time, by lowercased email (the stable identifier on both
 * sides), falling back to a lowercased name match when either side lacks an
 * email. A user with no match is a plain Headscale/local user with no
 * Headtower login.
 */
function matchAccounts(
  list: User[],
  accountRows: AppUser[],
): Map<string, AppUser> {
  const byEmail = new Map<string, AppUser>();
  const byName = new Map<string, AppUser>();
  for (const account of accountRows) {
    const email = account.email?.trim().toLowerCase();
    if (email && !byEmail.has(email)) byEmail.set(email, account);
    const name = account.name.trim().toLowerCase();
    if (name && !byName.has(name)) byName.set(name, account);
  }

  const matches = new Map<string, AppUser>();
  for (const user of list) {
    const email = user.email?.trim().toLowerCase();
    const match =
      (email ? byEmail.get(email) : undefined) ??
      byName.get(user.displayName?.trim().toLowerCase() ?? "") ??
      byName.get(user.name?.trim().toLowerCase() ?? "");
    if (match) matches.set(user.id, match);
  }
  return matches;
}

export default async function UsersPage() {
  let data: UsersData | null = null;
  let error: string | null = null;
  try {
    data = await loadUsers();
  } catch (err) {
    error = describeHeadscaleError(err);
  }

  const list = data?.list ?? [];
  const nodeCounts = data?.nodeCounts ?? null;
  const accounts = data?.accounts ?? new Map<string, AppUser>();
  // Only roles with users.write may create users; hide the affordance otherwise.
  // The same capability gates the per-row rename/delete actions, so one read
  // covers both the create button and the kebab column.
  const canCreate = await sessionCan("users.write");
  const canManage = canCreate;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        eyebrow="Directory"
        title={
          <span className="inline-flex items-center gap-2.5">
            Users
            {!error && (
              <Chip mono variant="default">
                {list.length}
              </Chip>
            )}
          </span>
        }
        description="People and service accounts that own nodes in the tailnet."
      >
        {!error && list.length > 0 && canCreate && <AddUserDialog />}
      </SectionHeading>

      {error ? (
        <ErrorPanel message={error} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No users yet"
          description="Create a user, then enrol nodes against it with a pre-auth key or interactive login."
          action={canCreate ? <AddUserDialog /> : undefined}
        />
      ) : (
        <Card>
          <Table>
            <TableHead>
              <Tr className="hover:bg-transparent">
                <Th>User</Th>
                <Th>ID</Th>
                <Th align="right">Nodes</Th>
                <Th>Source</Th>
                <Th className={canManage ? undefined : "pr-4"} align="right">
                  Created
                </Th>
                {canManage && (
                  <Th className="pr-4" align="right">
                    <span className="sr-only">Actions</span>
                  </Th>
                )}
              </Tr>
            </TableHead>
            <TableBody>
              {list.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  account={accounts.get(user.id) ?? null}
                  nodeCount={nodeCounts?.get(user.id) ?? null}
                  countsAvailable={nodeCounts !== null}
                  canManage={canManage}
                />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function UserRow({
  user,
  account,
  nodeCount,
  countsAvailable,
  canManage,
}: {
  user: User;
  /** The Headtower account matched to this tailnet user, if it signed in via OIDC. */
  account: AppUser | null;
  nodeCount: number | null;
  countsAvailable: boolean;
  /** Renders the trailing kebab column when the session can manage users. */
  canManage: boolean;
}) {
  const displayName = user.displayName?.trim() || user.name;
  const showHandle = Boolean(user.displayName?.trim()) && user.displayName.trim() !== user.name;
  const created = formatDate(user.createdAt);
  const provider = user.provider?.trim();

  return (
    <Tr className="group">
      <Td>
        <div className="flex items-center gap-3">
          <Avatar user={user} account={account} />
          <div className="flex min-w-0 flex-col leading-tight">
            <Link
              href={`/users/${user.id}`}
              className="truncate font-medium text-ink transition-colors hover:text-beacon-500"
            >
              {displayName}
            </Link>
            {showHandle && (
              <span className="data truncate text-xs text-ink-faint">@{user.name}</span>
            )}
          </div>
        </div>
      </Td>
      <Td data className="text-ink-muted">
        {user.id}
      </Td>
      <Td data align="right">
        {!countsAvailable ? (
          <span className="text-ink-faint" title="Node count unavailable">
            ·
          </span>
        ) : (
          // The count doubles as a jump to this user's slice of the machines
          // list; the `user` param is honoured by a later wave.
          <Link
            href={`/machines?user=${encodeURIComponent(user.name)}`}
            className="transition-colors hover:text-beacon-500"
          >
            {nodeCount && nodeCount > 0 ? (
              nodeCount
            ) : (
              <span className="text-ink-faint">0</span>
            )}
          </Link>
        )}
      </Td>
      <Td>
        {account ? (
          // Matched against a Headtower app_user: this person signed in via
          // OIDC, which is a more specific (and more trustworthy) source than
          // whatever Headscale itself might report below.
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip variant="beacon">SSO</Chip>
            <Chip variant="default">{ROLE_LABELS[account.role]}</Chip>
          </div>
        ) : provider ? (
          <Chip mono variant="default">
            {provider}
          </Chip>
        ) : (
          <span className="text-xs text-ink-faint">local</span>
        )}
      </Td>
      <Td
        data
        align="right"
        className={canManage ? "text-ink-muted" : "pr-4 text-ink-muted"}
        title={created?.title}
      >
        <span className="inline-flex items-center justify-end gap-2">
          {created ? created.label : <span className="text-ink-faint">·</span>}
          <ChevronRight
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          />
        </span>
      </Td>

      {/* Actions - the kebab wires the rename/delete dialogs; gated by
          users.write, matching the machines rows' actions column. */}
      {canManage && (
        <Td className="pr-4" align="right">
          <UserActions
            userId={user.id}
            name={user.name}
            ownedNodeCount={nodeCount ?? 0}
            redirectAfterDelete="/users"
            className="ml-auto"
          />
        </Td>
      )}
    </Tr>
  );
}

function Avatar({ user, account }: { user: User; account: AppUser | null }) {
  const label = user.displayName?.trim() || user.name || "?";
  // Prefer the matched Headtower account's OIDC picture; fall back to
  // whatever Headscale itself has on file for the user.
  const src = account?.picture?.trim() || user.profilePicUrl?.trim();

  if (src) {
    return <AvatarImage src={src} fallback={initialOf(label)} />;
  }

  return (
    <span
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2 text-xs font-medium text-ink-muted"
    >
      {initialOf(label)}
    </span>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <EmptyState
      tone="critical"
      icon={TriangleAlert}
      title="Couldn't load users"
      description={message}
      action={
        <Link
          href="/users"
          className="text-xs font-medium text-beacon-500 transition-colors hover:text-beacon-400"
        >
          Retry
        </Link>
      }
    />
  );
}

/** First character of a label, uppercased; unicode-safe. */
function initialOf(label: string): string {
  const first = Array.from(label.trim())[0] ?? "?";
  return first.toUpperCase();
}

/** Render a timestamp as a schematic UTC date (YYYY-MM-DD) plus a full title. */
function formatDate(ts: string | null): { label: string; title: string } | null {
  if (!ts) return null;
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return null;
  return { label: date.toISOString().slice(0, 10), title: date.toISOString() };
}
