"use client";

import * as React from "react";
import { useTransition } from "react";
import { CheckCheck, TriangleAlert } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { approveAllPending, type ApproveAllEntry } from "./actions";

export interface ApproveAllButtonProps {
  /** Nodes to sweep - the header passes every pending node, a card passes just itself. */
  entries: ApproveAllEntry[];
  /** Trigger label - "Approve all pending" (header) or "Approve all" (card). */
  label: string;
  title: string;
  description: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}

/**
 * Confirm-then-batch-approve button. The header's tailnet-wide sweep and a
 * node card's own "Approve all" both render this - they only differ in which
 * slice of `ApproveAllEntry[]` (built by `route-batch.ts`) they pass in.
 *
 * Approving routes isn't destructive in the delete sense, but it's a
 * one-shot bulk control-plane change an operator can't easily eyeball before
 * it happens, so it gets the same "confirm with the exact list" treatment as
 * this codebase's destructive dialogs (see `NodeActions`'s delete form).
 */
export function ApproveAllButton({
  entries,
  label,
  title,
  description,
  size = "sm",
  variant = "outline",
}: ApproveAllButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const totalCidrs = entries.reduce((sum, entry) => sum + entry.cidrs.length, 0);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setError(null);
  }

  function handleApprove() {
    startTransition(async () => {
      const result = await approveAllPending(entries);
      if (result.status === "success") {
        setOpen(false);
      } else {
        setError(result.error ?? "Couldn't approve the pending routes.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>
          <CheckCheck className="h-3.5 w-3.5" aria-hidden />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto rounded-control border border-line bg-surface-2 p-2.5">
            {entries.map((entry) => (
              <li key={entry.nodeId} className="text-xs leading-relaxed">
                <span className="font-medium text-ink">{entry.nodeName}</span>{" "}
                <span className="data text-ink-faint">{entry.cidrs.join(", ")}</span>
              </li>
            ))}
          </ul>
        </DialogBody>
        {error && (
          <p className="flex items-start gap-1.5 px-5 pb-1 text-xs text-critical-500">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="sm" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="solid"
            size="sm"
            onClick={handleApprove}
            disabled={pending}
          >
            {pending
              ? "Approving…"
              : `Approve ${totalCidrs} route${totalCidrs === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
