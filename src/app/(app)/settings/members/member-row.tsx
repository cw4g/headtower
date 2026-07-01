"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { MoreHorizontal, Trash2, TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Select } from "@/components/ui/field";
import { Td, Tr } from "@/components/ui/table";
import type { AppUser } from "@/lib/db";
import { removeMember, updateMemberRole } from "./actions";

export interface MemberRowProps {
  member: AppUser;
  /** True for the row belonging to the viewing session's own account. */
  isSelf: boolean;
  canManage: boolean;
  roleOptions: { value: string; label: string }[];
}

export function MemberRow({ member, isSelf, canManage, roleOptions }: MemberRowProps) {
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, startTransition] = useTransition();

  function onRoleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextRole = event.target.value;
    setError(null);
    startTransition(async () => {
      const result = await updateMemberRole(member.id, nextRole);
      if (result.status === "error") setError(result.error);
    });
  }

  function onRemove() {
    startTransition(async () => {
      const result = await removeMember(member.id);
      if (result.status === "success") setConfirmRemove(false);
      else setError(result.error);
    });
  }

  const lastLogin = member.lastLoginAt
    ? new Date(member.lastLoginAt).toISOString().slice(0, 10)
    : null;

  return (
    <Tr>
      <Td className="pl-4">
        <div className="flex items-center gap-2.5">
          <Avatar name={member.name} picture={member.picture} />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-medium text-ink">
              {member.name}
              {isSelf && (
                <span className="ml-1.5 text-xs font-normal text-ink-faint">(you)</span>
              )}
            </span>
            {member.email && (
              <span className="data truncate text-xs text-ink-faint">{member.email}</span>
            )}
          </div>
        </div>
      </Td>
      <Td>
        {canManage ? (
          <div className="flex flex-col gap-1">
            <Select
              value={member.role}
              onChange={onRoleChange}
              disabled={pending}
              className="h-8 w-36 text-xs"
              aria-label={`Role for ${member.name}`}
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            {error && (
              <span className="flex items-center gap-1 text-xs text-critical-500">
                <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden />
                {error}
              </span>
            )}
          </div>
        ) : (
          <Chip variant="default">{roleOptions.find((r) => r.value === member.role)?.label ?? member.role}</Chip>
        )}
      </Td>
      <Td data className="text-ink-muted">
        {lastLogin ?? <span className="text-ink-faint">never</span>}
      </Td>
      <Td className="pr-4 text-right">
        {canManage && !isSelf ? (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Member actions"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-control text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40"
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  destructive
                  onSelect={(event) => {
                    event.preventDefault();
                    setConfirmRemove(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Remove account
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <span className="pr-1 text-xs text-ink-faint">—</span>
        )}
      </Td>

      <Dialog
        open={confirmRemove}
        onOpenChange={(next) => {
          setConfirmRemove(next);
          if (!next) setError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove account</DialogTitle>
            <DialogDescription>
              <span className="text-ink">{member.name}</span> loses access to this
              console immediately and every active session is signed out. They can
              sign back in through single sign-on to create a new account. This
              can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p
              role="alert"
              className="mx-6 flex items-start gap-2 rounded-control border border-critical-500/40 bg-critical-500/10 px-3 py-2 text-xs text-critical-500"
            >
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button variant="danger" size="sm" onClick={onRemove} disabled={pending}>
              {pending ? "Removing…" : "Remove account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tr>
  );
}

function Avatar({ name, picture }: { name: string; picture: string | null }) {
  if (picture) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external IdP avatar, no static optimization.
      <img
        src={picture}
        alt=""
        referrerPolicy="no-referrer"
        className="h-7 w-7 shrink-0 rounded-full border border-line object-cover"
      />
    );
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-xs font-medium text-ink-muted">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
