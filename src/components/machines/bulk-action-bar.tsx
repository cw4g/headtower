"use client";

import * as React from "react";
import { Ban, Tags as TagsIcon, Trash2, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
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
import type { NodeView } from "@/lib/machines";
import {
  bulkDeleteNodes,
  bulkExpireNodes,
  bulkSetNodeTags,
  type BulkActionResult,
  type BulkFailure,
} from "@/app/(app)/machines/actions";

/** Hard ceiling on a single bulk op, mirrored server-side. */
const BULK_LIMIT = 200;

type BulkDialog = "tag" | "expire" | "delete" | null;

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

/**
 * Floating bulk action bar for the machines list. Appears while any nodes are
 * selected and offers the same four mutations as the per-row menu, applied over
 * the selection: add a tag, expire keys, or delete (type-to-confirm), plus
 * Clear. Each op runs the matching bulk Server Action, which loops the per-id
 * primitives and returns `{ succeeded, failed, errors }`; a partial failure is
 * rendered inline in an amber panel naming the rows that didn't take, and the
 * rows that did succeed are pruned from the selection.
 */
export function BulkActionBar({
  selected,
  onClear,
  onResolve,
}: {
  /** The currently selected nodes (already scoped to the visible/filtered set). */
  selected: NodeView[];
  /** Clear the whole selection. */
  onClear: () => void;
  /** Drop the given ids from the selection after an op resolves them. */
  onResolve: (succeededIds: string[]) => void;
}) {
  const [dialog, setDialog] = React.useState<BulkDialog>(null);
  const [pending, startTransition] = React.useTransition();
  const [failures, setFailures] = React.useState<BulkFailure[] | null>(null);
  const [failedVerb, setFailedVerb] = React.useState("");

  const count = selected.length;
  const overLimit = count > BULK_LIMIT;
  // Map ids to names so the amber panel can name the rows that failed.
  const nameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const node of selected) map.set(node.id, node.name);
    return map;
  }, [selected]);

  if (count === 0) return null;

  function run(action: () => Promise<BulkActionResult>, verb: string) {
    const ids = selected.map((n) => n.id);
    startTransition(async () => {
      const result = await action();
      const failedIds = new Set(result.errors.map((e) => e.id));
      onResolve(ids.filter((id) => !failedIds.has(id)));
      setDialog(null);
      if (result.failed > 0) {
        setFailures(result.errors);
        setFailedVerb(verb);
      } else {
        setFailures(null);
      }
    });
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
        <div className="pointer-events-auto flex w-full max-w-2xl flex-col gap-2 rounded-card border border-line-strong bg-surface p-2.5 shadow-2xl shadow-graphite-950/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="px-1 text-sm text-ink">
              <span className="data font-medium">{count}</span> selected
              {overLimit && (
                <span className="ml-2 text-xs text-warn-500">
                  over the {BULK_LIMIT} limit
                </span>
              )}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={pending || overLimit}
                onClick={() => setDialog("tag")}
              >
                <TagsIcon className="h-3.5 w-3.5" aria-hidden />
                Add tag
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-warn-500"
                disabled={pending || overLimit}
                onClick={() => setDialog("expire")}
              >
                <Ban className="h-3.5 w-3.5" aria-hidden />
                Expire
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-critical-500"
                disabled={pending || overLimit}
                onClick={() => setDialog("delete")}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Delete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setFailures(null);
                  onClear();
                }}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Clear
              </Button>
            </div>
          </div>

          {failures && failures.length > 0 && (
            <div className="rounded-control border border-warn-500/40 bg-warn-500/10 px-3 py-2 text-xs">
              <p className="flex items-center gap-1.5 font-medium text-warn-500">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {failures.length} of the selected machines couldn&apos;t be{" "}
                {failedVerb}.
              </p>
              <ul className="mt-1.5 flex flex-col gap-1 text-ink-muted">
                {failures.map((f) => (
                  <li key={f.id} className="flex flex-wrap gap-x-1.5">
                    <span className="font-medium text-ink">
                      {nameById.get(f.id) ?? `#${f.id}`}
                    </span>
                    <span className="text-ink-faint">{f.error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <TagDialog
        open={dialog === "tag"}
        count={count}
        pending={pending}
        onClose={() => setDialog(null)}
        onSubmit={(entered) =>
          run(
            () =>
              bulkSetNodeTags(
                selected.map((n) => ({
                  id: n.id,
                  tags: mergeTags(n.tags, entered),
                })),
              ),
            "tagged",
          )
        }
      />

      <ExpireDialog
        open={dialog === "expire"}
        count={count}
        pending={pending}
        onClose={() => setDialog(null)}
        onConfirm={() =>
          run(() => bulkExpireNodes(selected.map((n) => n.id)), "expired")
        }
      />

      <DeleteDialog
        open={dialog === "delete"}
        count={count}
        pending={pending}
        onClose={() => setDialog(null)}
        onConfirm={() =>
          run(() => bulkDeleteNodes(selected.map((n) => n.id)), "deleted")
        }
      />
    </>
  );
}

function TagDialog({
  open,
  count,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  count: number;
  pending: boolean;
  onClose: () => void;
  onSubmit: (tags: string[]) => void;
}) {
  const [draft, setDraft] = React.useState("");
  const parsed = parseTags(draft);
  const disabled = pending || parsed.length === 0;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    onSubmit(parsed);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setDraft("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add tag to {count} machines</DialogTitle>
          <DialogDescription>
            The tags are added to each selected machine&apos;s existing set. Each
            must be <span className="data">tag:</span>-prefixed; the prefix is
            added for you.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <Field
              label="Tags"
              htmlFor="bulk-tags-input"
              description="Comma or space separated, e.g. server prod."
            >
              <Input
                id="bulk-tags-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="tag:server"
                mono
                autoComplete="off"
                autoFocus
                disabled={pending}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="sm" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="solid" size="sm" disabled={disabled}>
              {pending ? "Applying…" : "Add tag"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExpireDialog({
  open,
  count,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  count: number;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Expire {count} node keys</DialogTitle>
          <DialogDescription>
            Force the {count} selected machines to re-authenticate. Each drops off
            the tailnet until it signs in again.
          </DialogDescription>
        </DialogHeader>
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
            className="text-warn-500"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Expiring…" : "Expire keys"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  open,
  count,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  count: number;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [confirm, setConfirm] = React.useState("");
  // Type-to-confirm: the operator must type DELETE <count> exactly.
  const phrase = `DELETE ${count}`;
  const disabled = pending || confirm.trim() !== phrase;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    onConfirm();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setConfirm("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {count} machines</DialogTitle>
          <DialogDescription>
            Permanently remove the {count} selected machines from the tailnet.
            This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <Field
              label={
                <>
                  Type <span className="data text-ink">{phrase}</span> to confirm
                </>
              }
              htmlFor="bulk-delete-confirm"
            >
              <Input
                id="bulk-delete-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={phrase}
                mono
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                autoFocus
                disabled={pending}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="sm" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="danger" size="sm" disabled={disabled}>
              {pending ? "Deleting…" : `Delete ${count}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
