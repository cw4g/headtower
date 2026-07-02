import Link from "next/link";
import { KeyRound, UserRoundPlus } from "lucide-react";
import {
  preAuthKeys as preAuthKeysApi,
  users as usersApi,
  type PreAuthKey,
  type User,
} from "@/lib/headscale";
import { sessionCan } from "@/lib/authz";
import { EmptyState } from "@/components/ui/empty-state";
import { describeHeadscaleError } from "../errors";
import { nowMs } from "../format";
import { SettingsError } from "../settings-error";
import { CreatePreAuthKeyFlag } from "./create-pre-auth-key-flag";
import type { UserOption } from "./create-pre-auth-key-dialog";
import { PreAuthKeysTable } from "./pre-auth-keys-table";

// Pre-auth keys are live control-plane state; never prebuild this view.
export const dynamic = "force-dynamic";

const PATH = "/settings/pre-auth-keys";

interface PreAuthKeysData {
  users: User[];
  keys: PreAuthKey[];
}

/** Load every user plus every pre-auth key, newest first. */
async function loadPreAuthKeys(): Promise<PreAuthKeysData> {
  const users = await usersApi.list();
  const unsorted = await preAuthKeysApi.listAll({ users });

  const keys = [...unsorted].sort((a, b) => {
    const at = Date.parse(a.createdAt) || 0;
    const bt = Date.parse(b.createdAt) || 0;
    return bt - at; // Newest first.
  });

  return { users, keys };
}

export default async function PreAuthKeysPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // The command palette's "Create pre-auth key" quick action lands here with
  // `?create=1`; `CreatePreAuthKeyFlag` auto-opens the dialog and strips it.
  const wantsCreate = (await searchParams).create === "1";

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
  // Minting and expiring pre-auth keys both require keys.write.
  const canManage = await sessionCan("keys.write");

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
        {!error && hasUsers && keys.length > 0 && canManage && (
          <CreatePreAuthKeyFlag users={userOptions} autoOpen={wantsCreate} />
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
          action={
            canManage ? (
              <CreatePreAuthKeyFlag users={userOptions} autoOpen={wantsCreate} />
            ) : undefined
          }
        />
      ) : (
        <PreAuthKeysTable
          keys={keys}
          owners={userOptions}
          now={now}
          canManage={canManage}
        />
      )}
    </div>
  );
}
