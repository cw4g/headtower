"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { Ban, MoreHorizontal, Trash2, TriangleAlert } from "lucide-react";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deletePreAuthKey, expirePreAuthKey } from "./actions";

export interface PreAuthKeyActionsProps {
  id: string;
  /** Owning user id (for the legacy expire shape and the delete audit entry). */
  user: string;
  /** The key secret (for the legacy expire shape). */
  keyValue: string;
  /** Already-lapsed keys can't be expired again (but can still be deleted). */
  expired: boolean;
}

type Mode = "expire" | "delete";

/**
 * Row actions for a pre-auth key: a quiet kebab opening an Expire or Delete
 * confirmation. Expire just stops future enrolments (0.26+); Delete removes
 * the row from the control plane outright (0.29+, surfaces the version error
 * inline if the server doesn't support it). Expired keys show Expire disabled
 * rather than vanishing, so the column stays aligned.
 */
export function PreAuthKeyActions({
  id,
  user,
  keyValue,
  expired,
}: PreAuthKeyActionsProps) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setMode(null);
    setError(null);
  }

  function run(action: () => ReturnType<typeof expirePreAuthKey>) {
    startTransition(async () => {
      const result = await action();
      if (result.status === "success") {
        close();
      } else {
        setError(result.error);
      }
    });
  }

  const isDelete = mode === "delete";

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
              if (!expired) setMode("expire");
            }}
          >
            <Ban className="h-4 w-4" aria-hidden />
            Expire key
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            destructive
            onSelect={(event) => {
              event.preventDefault();
              setMode("delete");
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Delete key
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={mode !== null} onOpenChange={(next) => (next ? null : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isDelete ? "Delete pre-auth key" : "Expire pre-auth key"}
            </DialogTitle>
            <DialogDescription>
              {isDelete ? (
                <>
                  Permanently remove key{" "}
                  <span className="data text-ink-faint">#{id}</span> from the
                  control plane. Nodes already enrolled with it stay connected.
                  This can&apos;t be undone.
                </>
              ) : (
                <>
                  Key <span className="data text-ink-faint">#{id}</span> stops
                  enrolling nodes immediately. Nodes already registered with it
                  stay connected. This can&apos;t be undone.
                </>
              )}
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
            {isDelete ? (
              <Button
                variant="danger"
                size="sm"
                disabled={pending}
                onClick={() => run(() => deletePreAuthKey({ id, user }))}
              >
                {pending ? "Deleting…" : "Delete key"}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="border-warn-500/50 text-warn-500 hover:bg-warn-500/10"
                disabled={pending}
                onClick={() => run(() => expirePreAuthKey({ id, user, key: keyValue }))}
              >
                {pending ? "Expiring…" : "Expire key"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
