"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  MoreHorizontal,
  PencilLine,
  TriangleAlert,
  Trash2,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";
import { deleteUser, renameUser } from "./actions";

export interface UserActionsProps {
  userId: string;
  name: string;
  /**
   * How many nodes this user still owns. A user that owns nodes can't be
   * deleted, so the delete dialog is rendered unactionable when this is > 0.
   */
  ownedNodeCount: number;
  /** Where to send the operator after a successful delete. */
  redirectAfterDelete: string;
  /** Extra classes for the trigger button. */
  className?: string;
}

type ActionKind = "rename" | "delete" | null;

/**
 * Kebab-triggered user actions for the detail page: Rename and Delete, each
 * wired to a Server Action. The dialog closes once the control plane confirms
 * the change; a typed reason surfaces inline when it doesn't.
 *
 * Each dialog's working state lives in an inner form that only mounts while the
 * dialog is open, so it always initialises from the user's current values.
 */
export function UserActions({
  userId,
  name,
  ownedNodeCount,
  redirectAfterDelete,
  className,
}: UserActionsProps) {
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
          <DropdownMenuSeparator />
          <DropdownMenuItem
            destructive
            onSelect={(event) => {
              event.preventDefault();
              setOpen("delete");
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Delete user
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={open === "rename"}
        onOpenChange={(v) => (v ? setOpen("rename") : close())}
      >
        <DialogContent>
          {open === "rename" && (
            <RenameForm userId={userId} name={name} onDone={close} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={open === "delete"}
        onOpenChange={(v) => (v ? setOpen("delete") : close())}
      >
        <DialogContent>
          {open === "delete" && (
            <DeleteForm
              userId={userId}
              name={name}
              ownedNodeCount={ownedNodeCount}
              redirectAfterDelete={redirectAfterDelete}
              onDone={close}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
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
  userId: string;
  name: string;
  /** Close the dialog once the control plane confirms the change. */
  onDone: () => void;
}

function RenameForm({ userId, name, onDone }: FormProps) {
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
      const result = await renameUser(userId, trimmed);
      if (result.status === "success") {
        onDone();
      } else {
        setError(result.error ?? "Couldn't rename the user.");
      }
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Rename user</DialogTitle>
        <DialogDescription>
          Change this user&apos;s name across the control plane. ACL policy
          rules that reference the old name are not rewritten; update them by
          hand if any exist.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          <Field
            label="Username"
            htmlFor="user-rename-input"
            description="Lowercase letters or digits, optionally with dots, hyphens, or underscores."
          >
            <Input
              id="user-rename-input"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              mono
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
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

function DeleteForm({
  userId,
  name,
  ownedNodeCount,
  redirectAfterDelete,
  onDone,
}: FormProps & { ownedNodeCount: number; redirectAfterDelete: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // A user that still owns nodes can't be deleted: Headscale would reject it,
  // so the operator is told to reassign or remove those nodes first rather than
  // being handed a dead-end confirm button.
  if (ownedNodeCount > 0) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Delete user</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-ink">{name}</span> still owns{" "}
            {ownedNodeCount} {ownedNodeCount === 1 ? "node" : "nodes"}. Delete or
            reassign every one of them before this user can be removed.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="sm">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </>
    );
  }

  const confirmed = confirm.trim() === name.trim();
  const disabled = pending || !confirmed;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    startTransition(async () => {
      const result = await deleteUser(userId);
      if (result.status === "success") {
        // The user no longer exists; leave its now-dead detail page.
        onDone();
        router.push(redirectAfterDelete);
      } else {
        setError(result.error ?? "Couldn't delete the user.");
      }
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Delete user</DialogTitle>
        <DialogDescription>
          Permanently remove <span className="font-medium text-ink">{name}</span>{" "}
          <span className="data text-ink-faint">#{userId}</span> from the
          tailnet. This cannot be undone.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          <Field label="Type the username to confirm" htmlFor="user-delete-confirm">
            <Input
              id="user-delete-confirm"
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
