"use client";

import * as React from "react";
import { X } from "lucide-react";
import type { PreAuthKey } from "@/lib/headscale";
import { Card } from "@/components/ui/card";
import { Chip, Tag } from "@/components/ui/chip";
import { CopyButton } from "@/components/ui/copy-button";
import { Select } from "@/components/ui/field";
import {
  CardRow,
  CardRowMeta,
  CardRowField,
  CardRows,
  Table,
  TableBody,
  TableDesktop,
  TableHead,
  Td,
  Th,
  Tr,
} from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { describeExpiry, formatDate, type ExpiryState } from "../format";
import { PreAuthKeyActions } from "./pre-auth-key-actions";

export interface PreAuthKeyOwner {
  id: string;
  label: string;
}

export interface PreAuthKeysTableProps {
  keys: PreAuthKey[];
  /** Owners to offer in the filter - the users list, so an owner with zero keys still shows. */
  owners: PreAuthKeyOwner[];
  now: number;
  canManage: boolean;
}

/** A key that can no longer enrol anything: expired, or a consumed single-use key. */
function isInactive(entry: PreAuthKey, now: number): boolean {
  const expiry = describeExpiry(entry.expiration, now);
  return expiry.state === "expired" || (entry.used && !entry.reusable);
}

/**
 * Filter rail (owner, hide expired/used) plus the keys table. Filtering runs
 * client-side over the list the page already loaded via `listAll` - no
 * re-fetch on every change, just an in-memory `.filter()`.
 */
export function PreAuthKeysTable({
  keys,
  owners,
  now,
  canManage,
}: PreAuthKeysTableProps) {
  const [ownerId, setOwnerId] = React.useState("");
  const [hideInactive, setHideInactive] = React.useState(false);

  const filtered = keys.filter((key) => {
    if (ownerId && key.user?.id !== ownerId) return false;
    if (hideInactive && isInactive(key, now)) return false;
    return true;
  });

  const hasFilter = ownerId !== "" || hideInactive;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[10rem] flex-col gap-1.5">
          <label
            htmlFor="pak-filter-owner"
            className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted"
          >
            Owner
          </label>
          <Select
            id="pak-filter-owner"
            value={ownerId}
            onChange={(event) => setOwnerId(event.target.value)}
            disabled={owners.length === 0}
          >
            <option value="">All owners</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.label}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="button"
          onClick={() => setHideInactive((v) => !v)}
          aria-pressed={hideInactive}
          className={cn(
            "h-9 rounded-control border px-3 text-xs font-medium transition-colors",
            hideInactive
              ? "border-line-strong bg-surface-2 text-ink"
              : "border-line text-ink-muted hover:text-ink",
          )}
        >
          Hide expired &amp; used
        </button>
        {hasFilter && (
          <button
            type="button"
            onClick={() => {
              setOwnerId("");
              setHideInactive(false);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-control px-2 text-xs font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Clear
          </button>
        )}
      </div>

      <Card>
        {filtered.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-ink-muted">No keys match the filters.</p>
            <button
              type="button"
              onClick={() => {
                setOwnerId("");
                setHideInactive(false);
              }}
              className="mt-1 text-xs text-beacon-500 hover:underline"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <>
            <TableDesktop>
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
                  {filtered.map((key) => (
                    <PreAuthKeyRow
                      key={key.id}
                      entry={key}
                      now={now}
                      canManage={canManage}
                    />
                  ))}
                </TableBody>
              </Table>
            </TableDesktop>

            {/* Below `md`, the columns above give way to one key+actions card
                per row instead of a table that scrolls the kebab off-screen. */}
            <CardRows>
              {filtered.map((key) => (
                <PreAuthKeyCard
                  key={key.id}
                  entry={key}
                  now={now}
                  canManage={canManage}
                />
              ))}
            </CardRows>
          </>
        )}
      </Card>
    </div>
  );
}

function PreAuthKeyRow({
  entry,
  now,
  canManage,
}: {
  entry: PreAuthKey;
  now: number;
  canManage: boolean;
}) {
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
        <PreAuthKeyProperties entry={entry} />
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
          {canManage ? (
            <PreAuthKeyActions
              id={entry.id}
              user={entry.user?.id ?? ""}
              keyValue={entry.key ?? ""}
              expired={expired}
            />
          ) : (
            <span className="pr-1 text-xs text-ink-faint">—</span>
          )}
        </div>
      </Td>
    </Tr>
  );
}

/** The reusable/single-use, ephemeral, and ACL-tag badges. Shared by the
 * desktop `Td` and the small-screen `CardRowField` so they never drift. */
function PreAuthKeyProperties({ entry }: { entry: PreAuthKey }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {entry.reusable ? <Tag>reusable</Tag> : <Tag>single-use</Tag>}
      {entry.ephemeral && <Tag>ephemeral</Tag>}
      {entry.aclTags?.map((tag) => <Tag key={tag}>{tag}</Tag>)}
    </div>
  );
}

/**
 * Small-screen counterpart to `PreAuthKeyRow`: the same key, owner,
 * properties, state, and expiry readouts, stacked into one card with the
 * kebab pinned on the right so it never scrolls away.
 */
function PreAuthKeyCard({
  entry,
  now,
  canManage,
}: {
  entry: PreAuthKey;
  now: number;
  canManage: boolean;
}) {
  const expiry = describeExpiry(entry.expiration, now);
  const expired = expiry.state === "expired";
  const created = formatDate(entry.createdAt);
  const ownerName = entry.user?.displayName?.trim() || entry.user?.name || "·";
  const preview = entry.key ? `${entry.key.slice(0, 14)}…` : `#${entry.id}`;

  return (
    <CardRow>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <code className="data text-xs text-ink" title={`#${entry.id}`}>
            {preview}
          </code>
          {entry.key && <CopyButton value={entry.key} label="Copy key" />}
        </div>
        <CardRowMeta>
          <CardRowField label="Owner">{ownerName}</CardRowField>
          <CardRowField label="State">
            <StateChip state={expiry.state} used={entry.used} reusable={entry.reusable} />
          </CardRowField>
          <CardRowField label="Expires" className="col-span-2">
            <span title={expiry.title ?? undefined}>{expiry.label}</span>
            {created && (
              <span className="ml-1.5 text-ink-faint" title={created.title}>
                made {created.label}
              </span>
            )}
          </CardRowField>
          <CardRowField label="Properties" className="col-span-2">
            <PreAuthKeyProperties entry={entry} />
          </CardRowField>
        </CardRowMeta>
      </div>

      <div className="shrink-0">
        {canManage ? (
          <PreAuthKeyActions
            id={entry.id}
            user={entry.user?.id ?? ""}
            keyValue={entry.key ?? ""}
            expired={expired}
          />
        ) : (
          <span className="pr-1 text-xs text-ink-faint">—</span>
        )}
      </div>
    </CardRow>
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
