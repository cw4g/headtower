"use client";

import * as React from "react";
import {
  Ban,
  PencilLine,
  PlugZap,
  Tags as TagsIcon,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Tag } from "@/components/ui/chip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

interface NodeActionsProps {
  nodeId: string;
  name: string;
  tags: string[];
}

type ActionKind = "rename" | "tags" | "expire" | "delete" | null;

/**
 * The node's operator actions. Each opens a fully-formed dialog; the committing
 * step is intentionally inert until the mutation layer (Server Actions) lands,
 * and every dialog says so plainly rather than pretending to succeed.
 */
export function NodeActions({ nodeId, name, tags }: NodeActionsProps) {
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

      <RenameDialog
        open={open === "rename"}
        onOpenChange={(v) => (v ? setOpen("rename") : close())}
        name={name}
      />
      <TagsDialog
        open={open === "tags"}
        onOpenChange={(v) => (v ? setOpen("tags") : close())}
        tags={tags}
      />
      <ExpireDialog
        open={open === "expire"}
        onOpenChange={(v) => (v ? setOpen("expire") : close())}
        name={name}
      />
      <DeleteDialog
        open={open === "delete"}
        onOpenChange={(v) => (v ? setOpen("delete") : close())}
        name={name}
        nodeId={nodeId}
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

/** Shared "this is a stub" footer note — honest about state. */
function PendingNote() {
  return (
    <p className="flex items-center gap-1.5 text-xs text-ink-faint">
      <PlugZap className="h-3.5 w-3.5 shrink-0" aria-hidden />
      Wiring to the control plane lands with the mutation layer.
    </p>
  );
}

interface DialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function RenameDialog({
  open,
  onOpenChange,
  name,
}: DialogShellProps & { name: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename machine</DialogTitle>
          <DialogDescription>
            Set the operator-facing display name. The host&apos;s own reported
            name is unchanged.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label="Display name" htmlFor="rename-input">
            <Input id="rename-input" defaultValue={name} autoComplete="off" />
          </Field>
        </DialogBody>
        <DialogFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <PendingNote />
          <div className="flex items-center gap-2">
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button variant="solid" size="sm" disabled>
              Rename
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TagsDialog({
  open,
  onOpenChange,
  tags,
}: DialogShellProps & { tags: string[] }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit tags</DialogTitle>
          <DialogDescription>
            ACL tags applied to this machine. Each must be{" "}
            <span className="data">tag:</span>-prefixed.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {tags.length > 0 ? (
              tags.map((tag) => <Tag key={tag}>{tag}</Tag>)
            ) : (
              <span className="text-xs text-ink-faint">No tags applied.</span>
            )}
          </div>
          <Field
            label="Add tag"
            htmlFor="tags-input"
            description="Comma or space separated."
          >
            <Input id="tags-input" placeholder="tag:server" mono autoComplete="off" />
          </Field>
        </DialogBody>
        <DialogFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <PendingNote />
          <div className="flex items-center gap-2">
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button variant="solid" size="sm" disabled>
              Save tags
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExpireDialog({
  open,
  onOpenChange,
  name,
}: DialogShellProps & { name: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Expire node key</DialogTitle>
          <DialogDescription>
            Force <span className="font-medium text-ink">{name}</span> to
            re-authenticate. It will drop off the tailnet until it signs in
            again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <PendingNote />
          <div className="flex items-center gap-2">
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button variant="outline" size="sm" disabled className="text-warn-500">
              Expire key
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  open,
  onOpenChange,
  name,
  nodeId,
}: DialogShellProps & { name: string; nodeId: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete machine</DialogTitle>
          <DialogDescription>
            Permanently remove <span className="font-medium text-ink">{name}</span>{" "}
            <span className="data text-ink-faint">#{nodeId}</span> from the
            tailnet. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <PendingNote />
          <div className="flex items-center gap-2">
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button variant="danger" size="sm" disabled>
              Delete
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
