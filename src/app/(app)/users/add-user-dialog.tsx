"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { UserRoundPlus } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { createUser } from "./actions";

export interface AddUserDialogProps {
  /** Custom trigger; defaults to the solid "Add user" button. */
  trigger?: React.ReactNode;
}

/**
 * Add-user dialog. The single beacon-accented action on the view: opens a modal
 * with one username Field that calls the `createUser` Server Action. Closes
 * itself once the control plane confirms the create; surfaces the reason inline
 * when it doesn't.
 */
export function AddUserDialog({ trigger }: AddUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setError(null); // Drop any stale error when the dialog closes.
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createUser({ status: "idle" }, formData);
      if (result.status === "success") {
        handleOpenChange(false);
      } else {
        setError(result.error ?? "Couldn't create the user.");
      }
    });
  }

  const invalid = Boolean(error);

  // Any edit clears the last create failure so a single message never lingers
  // across the several fields it might have come from.
  function clearError() {
    if (error) setError(null);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="solid">
            <UserRoundPlus className="h-4 w-4" aria-hidden />
            Add user
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>
            Create a tailnet user. Nodes and pre-auth keys are assigned to a
            user once it exists.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="flex flex-col gap-4">
            <Field
              label="Username"
              htmlFor="add-user-name"
              required
              description="Lowercase letters or digits, optionally with dots, hyphens, or underscores."
            >
              <Input
                id="add-user-name"
                name="name"
                mono
                autoFocus
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="e.g. ada"
                invalid={invalid}
                onChange={clearError}
              />
            </Field>
            <Field
              label="Display name"
              htmlFor="add-user-display-name"
              description="Optional. A friendly name shown across the console."
            >
              <Input
                id="add-user-display-name"
                name="displayName"
                autoComplete="off"
                placeholder="e.g. Ada Lovelace"
                onChange={clearError}
              />
            </Field>
            <Field
              label="Email"
              htmlFor="add-user-email"
              description="Optional. Used to match an SSO sign-in to this user."
            >
              <Input
                id="add-user-email"
                name="email"
                type="email"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="e.g. ada@example.com"
                onChange={clearError}
              />
            </Field>
            <Field
              label="Picture URL"
              htmlFor="add-user-picture-url"
              description="Optional. Avatar image shown for this user."
            >
              <Input
                id="add-user-picture-url"
                name="pictureUrl"
                mono
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="https://…"
                onChange={clearError}
              />
            </Field>
            {/* Headscale has no user-update endpoint: these three fields can
                only ever be set here, at create time. */}
            <p className="text-xs text-ink-faint">
              Display name, email, and picture can only be set now. Headscale
              can&apos;t change them once the user exists.
            </p>
            {invalid && <p className="text-xs text-critical-500">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="solid" disabled={pending}>
              {pending ? "Creating…" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
