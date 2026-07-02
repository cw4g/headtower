"use client";

import * as React from "react";
import {
  Ban,
  MoreHorizontal,
  PencilLine,
  Tags as TagsIcon,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";
import {
  NodeActionDialogs,
  type ActionKind,
} from "@/components/machines/node-action-dialogs";

export interface NodeActionsMenuProps {
  nodeId: string;
  name: string;
  tags: string[];
  /** Tailnet-wide tag suggestions for the Edit tags dialog (optional). */
  knownTags?: string[];
  /**
   * Where to send the operator after a successful delete. Omit on surfaces
   * that stay put and let the list revalidate in place (the table and card
   * views); the detail header passes "/machines" since its own path dies
   * with the node.
   */
  redirectAfterDelete?: string;
  /** Extra classes for the trigger button, e.g. to fit a card corner. */
  className?: string;
}

/**
 * Compact, kebab-triggered node actions - the same four Server-Action-backed
 * mutations as the detail page's Actions card, sized to sit inline in a table
 * row, a card corner, or a detail header. Each menu item opens one of the
 * shared dialogs; the dialog closes once the control plane confirms the change.
 */
export function NodeActionsMenu({
  nodeId,
  name,
  tags,
  knownTags,
  redirectAfterDelete,
  className,
}: NodeActionsMenuProps) {
  const [open, setOpen] = React.useState<ActionKind>(null);
  const close = () => setOpen(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${name}`}
            className={cn(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40",
              className,
            )}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setOpen("rename");
            }}
          >
            <PencilLine className="h-4 w-4" aria-hidden />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setOpen("tags");
            }}
          >
            <TagsIcon className="h-4 w-4" aria-hidden />
            Edit tags
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-warn-500 data-[highlighted]:bg-warn-500/10 data-[highlighted]:text-warn-500"
            onSelect={(event) => {
              event.preventDefault();
              setOpen("expire");
            }}
          >
            <Ban className="h-4 w-4" aria-hidden />
            Expire key
          </DropdownMenuItem>
          <DropdownMenuItem
            destructive
            onSelect={(event) => {
              event.preventDefault();
              setOpen("delete");
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Delete machine
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NodeActionDialogs
        nodeId={nodeId}
        name={name}
        tags={tags}
        knownTags={knownTags}
        open={open}
        onClose={close}
        redirectAfterDelete={redirectAfterDelete}
      />
    </>
  );
}
