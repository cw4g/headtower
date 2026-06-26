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
          <DialogBody>
            <Field
              label="Username"
              htmlFor="add-user-name"
              required
              description="Lowercase letters or digits, optionally with dots, hyphens, or underscores."
              error={invalid ? error : undefined}
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
                onChange={() => error && setError(null)}
              />
            </Field>
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
