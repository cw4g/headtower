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
import { Tooltip } from "@/components/ui/tooltip";
import { deleteApiKey, expireApiKey } from "./actions";

export interface ApiKeyActionsProps {
  prefix: string;
  /** Already-lapsed keys can't be expired again (but can still be deleted). */
  expired: boolean;
  /**
   * True when `prefix` is the key this Headtower process authenticates with.
   * Expire/delete are disabled outright - see `current-key.ts` and the
   * matching server-side guard in `actions.ts`.
   */
  isSelf?: boolean;
}

type Mode = "expire" | "delete";

const SELF_LOCK_MESSAGE =
  "Headtower uses this key - expiring it would lock the console out";

/**
 * Row actions for an API key: a kebab opening Expire or Delete confirmations,
 * each wired to a real Server Action. When this is the key authenticating the
 * current session, the trigger is disabled with an explanatory tooltip; the
 * same guard is re-enforced server-side in the actions themselves.
 */
export function ApiKeyActions({ prefix, expired, isSelf = false }: ApiKeyActionsProps) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setMode(null);
    setError(null);
  }

  function run(action: () => Promise<{ status: "success" } | { status: "error"; error: string }>) {
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

  const trigger = (
    <button
      type="button"
      aria-label="Key actions"
      aria-disabled={isSelf || undefined}
      disabled={isSelf}
      className="inline-flex h-7 w-7 items-center justify-center rounded-control text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40 disabled:pointer-events-none disabled:opacity-40"
    >
      <MoreHorizontal className="h-4 w-4" aria-hidden />
    </button>
  );

  return (
    <>
      {isSelf ? (
        <Tooltip content={SELF_LOCK_MESSAGE} side="left">
          {/* Radix Tooltip needs a focusable/hoverable child; the button is
              natively disabled so this only ever reads, never activates. */}
          <span tabIndex={0} className="inline-flex">
            {trigger}
          </span>
        </Tooltip>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
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
      )}

      <Dialog open={mode !== null} onOpenChange={(next) => (next ? null : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isDelete ? "Delete API key" : "Expire API key"}</DialogTitle>
            <DialogDescription>
              {isDelete ? (
                <>
                  Permanently remove key{" "}
                  <span className="data text-ink-faint">{prefix}</span> from the
                  control plane. Any tool using it loses access at once. This
                  can&apos;t be undone.
                </>
              ) : (
                <>
                  Key <span className="data text-ink-faint">{prefix}</span> stops
                  working immediately. Any tool using it loses access. This
                  can&apos;t be undone.
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
                onClick={() => run(() => deleteApiKey(prefix))}
              >
                {pending ? "Deleting…" : "Delete key"}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="border-warn-500/50 text-warn-500 hover:bg-warn-500/10"
                disabled={pending}
                onClick={() => run(() => expireApiKey(prefix))}
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
