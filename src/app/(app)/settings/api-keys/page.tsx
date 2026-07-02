import { KeySquare } from "lucide-react";
import { apiKeys as apiKeysApi, type ApiKey } from "@/lib/headscale";
import { sessionCan } from "@/lib/authz";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
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
import { ApiKeyActions } from "./api-key-actions";
import { CreateApiKeyDialog } from "./create-api-key-dialog";
import { isCurrentApiKey } from "./current-key";

// API keys are live control-plane state; never prebuild this view.
export const dynamic = "force-dynamic";

const PATH = "/settings/api-keys";

export default async function ApiKeysPage() {
  let keys: ApiKey[] | null = null;
  let error: string | null = null;
  try {
    keys = await apiKeysApi.list();
  } catch (err) {
    error = describeHeadscaleError(err);
  }

  const list = (keys ?? []).slice().sort((a, b) => {
    const at = Date.parse(a.createdAt) || 0;
    const bt = Date.parse(b.createdAt) || 0;
    return bt - at; // Newest first.
  });
  const now = nowMs();
  // Minting and expiring/deleting keys both require keys.write.
  const canManage = await sessionCan("keys.write");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold tracking-tight text-ink">
            API keys
          </h2>
          <p className="text-sm text-ink-muted">
            Bearer tokens for the Headscale admin API. Each grants full
            control-plane access.
          </p>
        </div>
        {!error && list.length > 0 && canManage && <CreateApiKeyDialog />}
      </div>

      {error ? (
        <SettingsError
          title="Couldn't load API keys"
          message={error}
          retryHref={PATH}
        />
      ) : list.length === 0 ? (
        <EmptyState
          icon={KeySquare}
          title="No API keys"
          description="Mint a key to authenticate against the Headscale admin API. The secret is shown once at creation."
          action={canManage ? <CreateApiKeyDialog /> : undefined}
        />
      ) : (
        <Card>
          <Table>
            <TableHead>
              <Tr className="hover:bg-transparent">
                <Th className="pl-4">Prefix</Th>
                <Th>State</Th>
                <Th align="right">Expires</Th>
                <Th align="right">Last seen</Th>
                <Th align="right">Created</Th>
                <Th className="pr-4 text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </Tr>
            </TableHead>
            <TableBody>
              {list.map((key) => (
                <ApiKeyRow
                  key={key.id}
                  entry={key}
                  current={isCurrentApiKey(key.prefix)}
                  now={now}
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

function ApiKeyRow({
  entry,
  current,
  now,
  canManage,
}: {
  entry: ApiKey;
  current: boolean;
  now: number;
  canManage: boolean;
}) {
  const expiry = describeExpiry(entry.expiration, now);
  const expired = expiry.state === "expired";
  const created = formatDate(entry.createdAt);
  const lastSeen = formatDate(entry.lastSeen);

  return (
    <Tr>
      <Td className="pl-4">
        <div className="flex items-center gap-2">
          <code className="data text-sm text-ink">{entry.prefix}</code>
          {current && (
            <Chip variant="beacon" mono title="The key this session is using">
              in use
            </Chip>
          )}
        </div>
      </Td>

      <Td>
        <StateChip state={expiry.state} />
      </Td>

      <Td data align="right" className="text-ink-muted" title={expiry.title ?? undefined}>
        {expiry.label}
      </Td>

      <Td data align="right" className="text-ink-muted" title={lastSeen?.title}>
        {lastSeen ? lastSeen.label : <span className="text-ink-faint">never</span>}
      </Td>

      <Td data align="right" className="text-ink-muted" title={created?.title}>
        {created ? created.label : <span className="text-ink-faint">·</span>}
      </Td>

      <Td className="pr-4 text-right">
        <div className="flex justify-end">
          {canManage ? (
            <ApiKeyActions prefix={entry.prefix} expired={expired} isSelf={current} />
          ) : (
            <span className="pr-1 text-xs text-ink-faint">—</span>
          )}
        </div>
      </Td>
    </Tr>
  );
}

function StateChip({ state }: { state: ExpiryState }) {
  if (state === "expired") {
    return (
      <Chip variant="critical" mono>
        expired
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
