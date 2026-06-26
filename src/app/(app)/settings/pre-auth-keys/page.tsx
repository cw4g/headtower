import Link from "next/link";
import { KeyRound, UserRoundPlus } from "lucide-react";
import {
  preAuthKeys as preAuthKeysApi,
  users as usersApi,
  type PreAuthKey,
  type User,
} from "@/lib/headscale";
import { Card } from "@/components/ui/card";
import { Chip, Tag } from "@/components/ui/chip";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableHead,
  Td,
  Th,
  Tr,
} from "@/components/ui/table";
import { describeHeadscaleError } from "../errors";
import { describeExpiry, formatDate, nowMs, type ExpiryState } from "../format";
import { SettingsError } from "../settings-error";
import {
  CreatePreAuthKeyDialog,
  type UserOption,
} from "./create-pre-auth-key-dialog";
import { PreAuthKeyActions } from "./pre-auth-key-actions";

// Pre-auth keys are live control-plane state; never prebuild this view.
export const dynamic = "force-dynamic";

const PATH = "/settings/pre-auth-keys";

interface PreAuthKeysData {
  users: User[];
  keys: PreAuthKey[];
}

/**
 * Load every pre-auth key. Headscale 0.26 - 0.28 lists keys per user; 0.29
 * returns all and ignores the filter. Fetching per user and de-duping by id
 * yields the full set across the whole supported range.
 */
async function loadPreAuthKeys(): Promise<PreAuthKeysData> {
  const users = await usersApi.list();
  const batches = await Promise.all(
    users.map((user) => preAuthKeysApi.list({ user: user.id })),
  );

  const byId = new Map<string, PreAuthKey>();
  for (const batch of batches) {
    for (const key of batch) byId.set(key.id, key);
  }

  const keys = [...byId.values()].sort((a, b) => {
    const at = Date.parse(a.createdAt) || 0;
    const bt = Date.parse(b.createdAt) || 0;
    return bt - at; // Newest first.
  });

  return { users, keys };
}

export default async function PreAuthKeysPage() {
  let data: PreAuthKeysData | null = null;
  let error: string | null = null;
  try {
    data = await loadPreAuthKeys();
  } catch (err) {
    error = describeHeadscaleError(err);
  }

  const users = data?.users ?? [];
  const keys = data?.keys ?? [];
  const userOptions: UserOption[] = users.map((user) => ({
    id: user.id,
    label: user.displayName?.trim() || user.name,
    handle: user.name,
  }));
  const hasUsers = users.length > 0;
  const now = nowMs();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold tracking-tight text-ink">
            Pre-auth keys
          </h2>
          <p className="text-sm text-ink-muted">
            Tokens that enrol nodes against a user without an interactive login.
          </p>
        </div>
        {!error && hasUsers && keys.length > 0 && (
          <CreatePreAuthKeyDialog users={userOptions} />
        )}
      </div>

      {error ? (
        <SettingsError
          title="Couldn't load pre-auth keys"
          message={error}
          retryHref={PATH}
        />
      ) : !hasUsers ? (
        <EmptyState
          icon={UserRoundPlus}
          title="No users yet"
          description="Pre-auth keys belong to a user. Create one first, then mint a key for it."
          action={
            <Link
              href="/users"
              className="text-xs font-medium text-beacon-500 transition-colors hover:text-beacon-400"
            >
              Go to Users
            </Link>
          }
        />
      ) : keys.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No pre-auth keys"
          description="Mint a key to enrol nodes non-interactively with `tailscale up --authkey`."
          action={<CreatePreAuthKeyDialog users={userOptions} />}
        />
      ) : (
        <Card>
          <Table>
            <TableHead>
              <Tr className="hover:bg-transparent">
                <Th className="pl-4">Key</Th>
                <Th>Owner</Th>
                <Th>Properties</Th>
                <Th>State</Th>
                <Th align="right">Expires</Th>
                <Th className="pr-4 text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </Tr>
            </TableHead>
            <TableBody>
              {keys.map((key) => (
                <PreAuthKeyRow key={key.id} entry={key} now={now} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function PreAuthKeyRow({ entry, now }: { entry: PreAuthKey; now: number }) {
  const expiry = describeExpiry(entry.expiration, now);
  const expired = expiry.state === "expired";
  const created = formatDate(entry.createdAt);
  const ownerName = entry.user?.displayName?.trim() || entry.user?.name || "·";
  const preview = entry.key ? `${entry.key.slice(0, 14)}…` : `#${entry.id}`;

  return (
    <Tr>
      <Td className="pl-4">
        <div className="flex items-center gap-1.5">
          <code className="data text-xs text-ink" title={`#${entry.id}`}>
            {preview}
          </code>
          {entry.key && <CopyButton value={entry.key} label="Copy key" />}
        </div>
      </Td>

      <Td className="text-ink-muted">{ownerName}</Td>

      <Td>
        <div className="flex flex-wrap items-center gap-1">
          {entry.reusable ? (
            <Tag>reusable</Tag>
          ) : (
            <Tag>single-use</Tag>
          )}
          {entry.ephemeral && <Tag>ephemeral</Tag>}
        </div>
      </Td>

      <Td>
        <StateChip state={expiry.state} used={entry.used} reusable={entry.reusable} />
      </Td>

      <Td data align="right" className="text-ink-muted" title={expiry.title ?? undefined}>
        {expiry.label}
        {created && (
          <span className="block text-xs text-ink-faint" title={created.title}>
            made {created.label}
          </span>
        )}
      </Td>

      <Td className="pr-4 text-right">
        <div className="flex justify-end">
          <PreAuthKeyActions
            id={entry.id}
            user={entry.user?.id ?? ""}
            keyValue={entry.key ?? ""}
            expired={expired}
          />
        </div>
      </Td>
    </Tr>
  );
}

function StateChip({
  state,
  used,
  reusable,
}: {
  state: ExpiryState;
  used: boolean;
  reusable: boolean;
}) {
  if (state === "expired") {
    return (
      <Chip variant="critical" mono>
        expired
      </Chip>
    );
  }
  // A consumed single-use key can no longer enrol, even while unexpired.
  if (used && !reusable) {
    return (
      <Chip variant="default" mono>
        used
      </Chip>
    );
  }
  if (state === "expiring") {
    return (
      <Chip variant="warn" mono>
        expiring
      </Chip>
    );
  }
  return (
    <Chip variant="online" mono>
      active
    </Chip>
  );
}
