"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { Ban, MoreHorizontal, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { expirePreAuthKey } from "./actions";

export interface PreAuthKeyActionsProps {
  id: string;
  /** Owning user id (for the legacy expire shape). */
  user: string;
  /** The key secret (for the legacy expire shape). */
  keyValue: string;
  /** Already-lapsed keys can't be expired again. */
  expired: boolean;
}

/**
 * Row actions for a pre-auth key: a quiet kebab opening an Expire confirmation.
 * Expire is the only lifecycle op the admin API offers for a key. Expired keys
 * show the menu disabled rather than vanishing, so the column stays aligned.
 */
export function PreAuthKeyActions({
  id,
  user,
  keyValue,
  expired,
}: PreAuthKeyActionsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConfirmOpenChange(next: boolean) {
    setConfirmOpen(next);
    if (!next) setError(null);
  }

  function expire() {
    startTransition(async () => {
      const result = await expirePreAuthKey({ id, user, key: keyValue });
      if (result.status === "success") {
        handleConfirmOpenChange(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Key actions"
            className="inline-flex h-7 w-7 items-center justify-center rounded-control text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            destructive
            disabled={expired}
            onSelect={(event) => {
              event.preventDefault();
              if (!expired) setConfirmOpen(true);
            }}
          >
            <Ban className="h-4 w-4" aria-hidden />
            Expire key
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={handleConfirmOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Expire pre-auth key</DialogTitle>
            <DialogDescription>
              Key <span className="data text-ink-faint">#{id}</span> stops
              enrolling nodes immediately. Nodes already registered with it stay
              connected. This can&apos;t be undone.
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
            <Button
              variant="outline"
              size="sm"
              className="border-warn-500/50 text-warn-500 hover:bg-warn-500/10"
              disabled={pending}
              onClick={expire}
            >
              {pending ? "Expiring…" : "Expire key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
