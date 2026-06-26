"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { KeySquare, ShieldAlert, TriangleAlert } from "lucide-react";
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
import { Field, Select } from "@/components/ui/field";
import { SecretReveal } from "../secret-reveal";
import { API_KEY_DEFAULT, API_KEY_PRESETS } from "../expiry-presets";
import { createApiKey } from "./actions";

export interface CreateApiKeyDialogProps {
  trigger?: React.ReactNode;
}

/**
 * Create-API-key dialog. A form picking an expiry calls the `createApiKey`
 * Server Action, then the dialog reveals the secret exactly once - Headscale
 * never returns it again. Closing discards it from the UI.
 */
export function CreateApiKeyDialog({ trigger }: CreateApiKeyDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setError(null);
    setSecret(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createApiKey({ status: "idle" }, formData);
      if (result.status === "success") {
        setError(null);
        setSecret(result.secret);
      } else if (result.status === "error") {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="solid">
            <KeySquare className="h-4 w-4" aria-hidden />
            Create key
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {secret ? "API key created" : "Create API key"}
          </DialogTitle>
          <DialogDescription>
            {secret
              ? "This is the only time the full key is shown. Copy it now."
              : "A bearer token for the Headscale admin API. It grants full control-plane access."}
          </DialogDescription>
        </DialogHeader>

        {secret ? (
          <>
            <DialogBody className="flex flex-col gap-3">
              <SecretReveal value={secret} />
              <p className="flex items-start gap-1.5 text-xs text-warn-500">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Store it somewhere safe. Once this dialog closes it can&apos;t be
                recovered, only replaced.
              </p>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="solid">Done</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogBody className="flex flex-col gap-4">
              <Field
                label="Expiry"
                htmlFor="apikey-expiry"
                description="The key stops working after this. Rotate before it lapses."
              >
                <Select
                  id="apikey-expiry"
                  name="expiry"
                  defaultValue={API_KEY_DEFAULT}
                >
                  {API_KEY_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </Select>
              </Field>

              {error && (
                <p className="flex items-start gap-1.5 text-xs text-critical-500">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  {error}
                </p>
              )}
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={pending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" variant="solid" disabled={pending}>
                {pending ? "Creating…" : "Create key"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
