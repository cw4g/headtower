"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { LogOut, MonitorSmartphone, MoreHorizontal, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  Dialog,
  DialogBody,
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
import { Td, Tr } from "@/components/ui/table";
import { revokeSession, signOutOtherSessions } from "./actions";

/** A pre-formatted timestamp, ready to render (see the page's `formatDate`). */
export interface FormattedDate {
  label: string;
  title: string;
}

export interface SessionRowData {
  id: string;
  isCurrent: boolean;
  created: FormattedDate;
  expires: FormattedDate;
}

/**
 * Bulk "sign out other sessions" control for the Sessions card header - the
 * self-service gap a plain per-row revoke list still leaves open. Disabled
 * when this is the only session, so it never reads as an offer to do nothing.
 */
export function SignOutOthersButton({ otherCount }: { otherCount: number }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setConfirmOpen(next);
    if (!next) setError(null);
  }

  function signOutOthers() {
    startTransition(async () => {
      const result = await signOutOtherSessions();
      if (result.status === "success") {
        handleOpenChange(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={otherCount === 0}
        onClick={() => setConfirmOpen(true)}
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden />
        Sign out other sessions
      </Button>

      <Dialog open={confirmOpen} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out other sessions</DialogTitle>
            <DialogDescription>
              Every session but this device is revoked at once. Each one is sent
              back to sign-in on its next request. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <DialogBody className="pt-0">
              <p className="flex items-start gap-1.5 text-xs text-critical-500">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {error}
              </p>
            </DialogBody>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="danger" size="sm" disabled={pending} onClick={signOutOthers}>
              {pending ? "Signing out…" : "Sign out other sessions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** One session table row: the device cells (server-rendered by the page) plus this row's actions. */
export function SessionRow({ row }: { row: SessionRowData }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setConfirmOpen(next);
    if (!next) setError(null);
  }

  function revoke() {
    startTransition(async () => {
      const result = await revokeSession(row.id);
      if (result.status === "success") {
        handleOpenChange(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Tr>
      <Td className="pl-4">
        <div className="flex items-center gap-2">
          <MonitorSmartphone className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
          <code className="data text-xs text-ink-muted" title={row.id}>
            #{row.id.slice(0, 8)}
          </code>
          {row.isCurrent && (
            <Chip variant="beacon" mono title="The session making this request">
              this device
            </Chip>
          )}
        </div>
      </Td>

      <Td data className="text-ink-muted" title={row.created.title}>
        {row.created.label}
      </Td>

      <Td data align="right" className="text-ink-muted" title={row.expires.title}>
        {row.expires.label}
      </Td>

      <Td className="pr-4 text-right">
        <div className="flex justify-end">
          {row.isCurrent ? (
            <span
              className="pr-1 text-xs text-ink-faint"
              title="This is the session you're using right now"
            >
              protected
            </span>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Session actions"
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
                    setConfirmOpen(true);
                  }}
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                  Revoke session
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </Td>

      <Dialog open={confirmOpen} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke session</DialogTitle>
            <DialogDescription>
              That device is signed out immediately - its next request is sent
              back to sign-in. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <DialogBody className="pt-0">
              <p className="flex items-start gap-1.5 text-xs text-critical-500">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {error}
              </p>
            </DialogBody>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="danger" size="sm" disabled={pending} onClick={revoke}>
              {pending ? "Revoking…" : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tr>
  );
}
