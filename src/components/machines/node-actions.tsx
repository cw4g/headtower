"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  PencilLine,
  Tags as TagsIcon,
  TriangleAlert,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
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
import {
  deleteNode,
  expireNode,
  renameNode,
  setNodeTags,
} from "@/app/(app)/machines/actions";

interface NodeActionsProps {
  nodeId: string;
  name: string;
  tags: string[];
}

type ActionKind = "rename" | "tags" | "expire" | "delete" | null;

/**
 * The node's operator actions. Each opens a fully-formed dialog wired to a
 * Server Action: the mutation runs on the server, the dialog closes once the
 * control plane confirms it, and the reason surfaces inline when it doesn't.
 *
 * Each dialog's working state lives in an inner form that only mounts while the
 * dialog is open, so it always initialises from the node's current values.
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

      <Dialog
        open={open === "rename"}
        onOpenChange={(v) => (v ? setOpen("rename") : close())}
      >
        <DialogContent>
          {open === "rename" && (
            <RenameForm nodeId={nodeId} name={name} onDone={close} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={open === "tags"}
        onOpenChange={(v) => (v ? setOpen("tags") : close())}
      >
        <DialogContent>
          {open === "tags" && (
            <TagsForm nodeId={nodeId} tags={tags} onDone={close} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={open === "expire"}
        onOpenChange={(v) => (v ? setOpen("expire") : close())}
      >
        <DialogContent>
          {open === "expire" && (
            <ExpireForm nodeId={nodeId} name={name} onDone={close} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={open === "delete"}
        onOpenChange={(v) => (v ? setOpen("delete") : close())}
      >
        <DialogContent>
          {open === "delete" && (
            <DeleteForm nodeId={nodeId} name={name} onDone={close} />
          )}
        </DialogContent>
      </Dialog>
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

/** Inline, on-brand failure note for a dialog action. */
function DialogError({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 px-5 pb-1 text-xs text-critical-500">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

interface FormProps {
  nodeId: string;
  /** Close the dialog once the control plane confirms the change. */
  onDone: () => void;
}

function RenameForm({ nodeId, name, onDone }: FormProps & { name: string }) {
  const [value, setValue] = React.useState(name);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const trimmed = value.trim();
  const unchanged = trimmed === name.trim();
  const disabled = pending || trimmed.length === 0 || unchanged;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    startTransition(async () => {
      const result = await renameNode(nodeId, trimmed);
      if (result.status === "success") {
        onDone();
      } else {
        setError(result.error ?? "Couldn't rename the machine.");
      }
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Rename machine</DialogTitle>
        <DialogDescription>
          Set the operator-facing display name. The host&apos;s own reported
          name is unchanged.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          <Field label="Display name" htmlFor="rename-input">
            <Input
              id="rename-input"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              autoComplete="off"
              autoFocus
              disabled={pending}
              invalid={Boolean(error)}
            />
          </Field>
        </DialogBody>
        {error && <DialogError>{error}</DialogError>}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="sm" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" variant="solid" size="sm" disabled={disabled}>
            {pending ? "Renaming…" : "Rename"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

/** Parse a free-text token blob into normalised, `tag:`-prefixed tags. */
function parseTags(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith("tag:") ? t : `tag:${t}`));
}

/** Merge tag lists, preserving order and dropping duplicates. */
function mergeTags(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const tag of list) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

function TagsForm({ nodeId, tags, onDone }: FormProps & { tags: string[] }) {
  const [current, setCurrent] = React.useState<string[]>(tags);
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function commitDraft() {
    const parsed = parseTags(draft);
    if (parsed.length === 0) return;
    setCurrent((prev) => mergeTags(prev, parsed));
    setDraft("");
  }

  function removeTag(tag: string) {
    setCurrent((prev) => prev.filter((t) => t !== tag));
    if (error) setError(null);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    // Fold in any tag still sitting in the input but not yet added.
    const next = mergeTags(current, parseTags(draft));
    startTransition(async () => {
      const result = await setNodeTags(nodeId, next);
      if (result.status === "success") {
        onDone();
      } else {
        setError(result.error ?? "Couldn't update tags.");
      }
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit tags</DialogTitle>
        <DialogDescription>
          ACL tags applied to this machine. Each must be{" "}
          <span className="data">tag:</span>-prefixed.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit}>
        <DialogBody className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {current.length > 0 ? (
              current.map((tag) => (
                <RemovableTag
                  key={tag}
                  tag={tag}
                  onRemove={() => removeTag(tag)}
                  disabled={pending}
                />
              ))
            ) : (
              <span className="text-xs text-ink-faint">No tags applied.</span>
            )}
          </div>
          <Field
            label="Add tag"
            htmlFor="tags-input"
            description="Comma or space separated. Press Enter to add."
          >
            <Input
              id="tags-input"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitDraft();
                }
              }}
              placeholder="tag:server"
              mono
              autoComplete="off"
              disabled={pending}
            />
          </Field>
        </DialogBody>
        {error && <DialogError>{error}</DialogError>}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="sm" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" variant="solid" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save tags"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

/** A tag pill with a remove affordance; mirrors the shared Tag styling. */
function RemovableTag({
  tag,
  onRemove,
  disabled,
}: {
  tag: string;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <span className="data inline-flex items-center gap-1 rounded-[0.3rem] border border-line-strong bg-surface-2 py-0.5 pl-1.5 pr-1 text-xs text-ink-muted">
      {tag}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove ${tag}`}
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-[0.2rem] text-ink-faint transition-colors hover:bg-surface hover:text-ink disabled:pointer-events-none disabled:opacity-50"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}

function ExpireForm({ nodeId, name, onDone }: FormProps & { name: string }) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function handleExpire() {
    startTransition(async () => {
      const result = await expireNode(nodeId);
      if (result.status === "success") {
        onDone();
      } else {
        setError(result.error ?? "Couldn't expire the node key.");
      }
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Expire node key</DialogTitle>
        <DialogDescription>
          Force <span className="font-medium text-ink">{name}</span> to
          re-authenticate. It will drop off the tailnet until it signs in again.
        </DialogDescription>
      </DialogHeader>
      {error && <DialogError>{error}</DialogError>}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost" size="sm" disabled={pending}>
            Cancel
          </Button>
        </DialogClose>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleExpire}
          disabled={pending}
          className="text-warn-500"
        >
          {pending ? "Expiring…" : "Expire key"}
        </Button>
      </DialogFooter>
    </>
  );
}

function DeleteForm({ nodeId, name, onDone }: FormProps & { name: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const confirmed = confirm.trim() === name.trim();
  const disabled = pending || !confirmed;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    startTransition(async () => {
      const result = await deleteNode(nodeId);
      if (result.status === "success") {
        // The node no longer exists; leave its now-dead detail page.
        onDone();
        router.push("/machines");
      } else {
        setError(result.error ?? "Couldn't delete the machine.");
      }
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Delete machine</DialogTitle>
        <DialogDescription>
          Permanently remove <span className="font-medium text-ink">{name}</span>{" "}
          <span className="data text-ink-faint">#{nodeId}</span> from the
          tailnet. This cannot be undone.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          <Field
            label="Type the machine name to confirm"
            htmlFor="delete-confirm"
          >
            <Input
              id="delete-confirm"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                if (error) setError(null);
              }}
              placeholder={name}
              mono
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={pending}
            />
          </Field>
        </DialogBody>
        {error && <DialogError>{error}</DialogError>}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="sm" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" variant="danger" size="sm" disabled={disabled}>
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
