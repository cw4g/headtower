import { TriangleAlert, UsersRound } from "lucide-react";
import { nodes, users, type User } from "@/lib/headscale";
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

// The tailnet is live state: always render against the control plane, never a
// build-time snapshot.
export const dynamic = "force-dynamic";

interface UsersData {
  list: User[];
  /** Node count per user id, or null when the node list couldn't be read. */
  nodeCounts: Map<string, number> | null;
}

async function loadUsers(): Promise<UsersData> {
  const list = await users.list();

  // Node counts are best-effort: a healthy user list shouldn't be withheld just
  // because the node read failed. Null signals "unavailable" to the table.
  let nodeCounts: Map<string, number> | null = null;
  try {
    const nodeList = await nodes.list();
    nodeCounts = new Map();
    for (const node of nodeList) {
      const ownerId = node.user?.id;
      if (!ownerId) continue;
      nodeCounts.set(ownerId, (nodeCounts.get(ownerId) ?? 0) + 1);
    }
  } catch {
    nodeCounts = null;
  }

  return { list, nodeCounts };
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
        {!error && list.length > 0 && <AddUserDialog />}
      </SectionHeading>

      {error ? (
        <ErrorPanel message={error} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No users yet"
          description="Create a user, then enrol nodes against it with a pre-auth key or interactive login."
          action={<AddUserDialog />}
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
                <Th align="right">Created</Th>
              </Tr>
            </TableHead>
            <TableBody>
              {list.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  nodeCount={nodeCounts?.get(user.id) ?? null}
                  countsAvailable={nodeCounts !== null}
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
  nodeCount,
  countsAvailable,
}: {
  user: User;
  nodeCount: number | null;
  countsAvailable: boolean;
}) {
  const displayName = user.displayName?.trim() || user.name;
  const showHandle = Boolean(user.displayName?.trim()) && user.displayName.trim() !== user.name;
  const created = formatDate(user.createdAt);
  const provider = user.provider?.trim();

  return (
    <Tr>
      <Td>
        <div className="flex items-center gap-3">
          <Avatar user={user} />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-medium text-ink">{displayName}</span>
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
        ) : nodeCount && nodeCount > 0 ? (
          nodeCount
        ) : (
          <span className="text-ink-faint">0</span>
        )}
      </Td>
      <Td>
        {provider ? (
          <Chip mono variant="default">
            {provider}
          </Chip>
        ) : (
          <span className="text-xs text-ink-faint">local</span>
        )}
      </Td>
      <Td data align="right" className="text-ink-muted" title={created?.title}>
        {created ? created.label : <span className="text-ink-faint">·</span>}
      </Td>
    </Tr>
  );
}

function Avatar({ user }: { user: User }) {
  const label = user.displayName?.trim() || user.name || "?";
  const src = user.profilePicUrl?.trim();

  if (src) {
    return (
      // Avatars come from arbitrary OIDC providers; a plain img avoids
      // per-host remote-image config. Decorative, so alt is empty.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={28}
        height={28}
        loading="lazy"
        className="h-7 w-7 shrink-0 rounded-md border border-line object-cover"
      />
    );
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
    <div className="grid-field flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-critical-500/40 px-6 py-14 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-card border border-critical-500/30 bg-critical-500/10 text-critical-500">
        <TriangleAlert className="h-5 w-5" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ink">Couldn&apos;t load users</p>
        <p className="mx-auto max-w-sm text-xs text-ink-muted">{message}</p>
      </div>
      <a
        href="/users"
        className="text-xs font-medium text-beacon-500 transition-colors hover:text-beacon-400"
      >
        Retry
      </a>
    </div>
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
