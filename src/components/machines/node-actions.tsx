"use client";

import * as React from "react";
import {
  Ban,
  PencilLine,
  Tags as TagsIcon,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  NodeActionDialogs,
  type ActionKind,
} from "@/components/machines/node-action-dialogs";

interface NodeActionsProps {
  nodeId: string;
  name: string;
  tags: string[];
  /** Tailnet-wide tag suggestions for the Edit tags dialog (optional). */
  knownTags?: string[];
}

/**
 * The node's operator actions as a stacked button list (the detail page's
 * Actions card). Each button opens one of the shared, Server-Action-backed
 * dialogs; on the detail page the current path dies with the node, so a
 * successful delete redirects to "/machines".
 */
export function NodeActions({ nodeId, name, tags, knownTags }: NodeActionsProps) {
  const [open, setOpen] = React.useState<ActionKind>(null);
  const close = () => setOpen(null);

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <ActionButton icon={PencilLine} onClick={() => setOpen("rename")}>
          Rename
        </ActionButton>
        <ActionButton icon={TagsIcon} onClick={() => setOpen("tags")}>
          Edit tags
        </ActionButton>
        <div className="my-1 h-px bg-line" />
        <ActionButton
          icon={Ban}
          tone="warn"
          onClick={() => setOpen("expire")}
        >
          Expire key
        </ActionButton>
        <ActionButton
          icon={Trash2}
          tone="critical"
          onClick={() => setOpen("delete")}
        >
          Delete machine
        </ActionButton>
      </div>

      <NodeActionDialogs
        nodeId={nodeId}
        name={name}
        tags={tags}
        knownTags={knownTags}
        open={open}
        onClose={close}
        redirectAfterDelete="/machines"
      />
    </>
  );
}

function ActionButton({
  icon: Icon,
  tone,
  children,
  onClick,
}: {
  icon: LucideIcon;
  tone?: "warn" | "critical";
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 w-full items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-2",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40",
        tone === "warn" && "text-warn-500 hover:border-warn-500/40",
        tone === "critical" && "text-critical-500 hover:border-critical-500/40",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {children}
    </button>
  );
}
