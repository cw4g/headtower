"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { KeySquare, MoreHorizontal, ShieldAlert, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, Input, Select } from "@/components/ui/field";
import { Td, Tr } from "@/components/ui/table";
import { PERSONAL_KEY_DEFAULT, PERSONAL_KEY_PRESETS } from "./expiry-presets";
import { createPersonalApiKey, revokePersonalApiKey } from "./actions";

/**
 * Create-personal-API-key dialog. The same mint-once, reveal-once, copy
 * pattern as the pre-auth and API key dialogs elsewhere in the console: a form
 * (name, optional expiry) calls the `createPersonalApiKey` Server Action, then
 * the dialog reveals the raw token exactly once - only its hash is stored, so
 * Headtower can never show it again either. Closing discards it from the UI.
 */
export function CreatePersonalApiKeyDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setError(null);
    setToken(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createPersonalApiKey({ status: "idle" }, formData);
      if (result.status === "success") {
        setError(null);
        setToken(result.token);
      } else if (result.status === "error") {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="solid">
          <KeySquare className="h-4 w-4" aria-hidden />
          Create key
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{token ? "Personal API key created" : "Create personal API key"}</DialogTitle>
          <DialogDescription>
            {token
              ? "This is the only time the full key is shown. Copy it now."
              : "A token scoped to your own account. Preview: Headtower does not enforce these keys yet, so one grants no access for now."}
          </DialogDescription>
        </DialogHeader>

        {token ? (
          <>
            <DialogBody className="flex flex-col gap-3">
              <div className="flex items-start gap-2 rounded-control border border-line-strong bg-surface-2 p-3">
                <code className="data min-w-0 flex-1 break-all text-xs leading-relaxed text-ink">
                  {token}
                </code>
                <CopyButton value={token} label="Copy key" className="mt-0.5" />
              </div>
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
                label="Name"
                htmlFor="pak-name"
                required
                description={'A label to tell this key apart later, e.g. "laptop".'}
              >
                <Input id="pak-name" name="name" required maxLength={80} autoFocus />
              </Field>

              <Field label="Expiry" htmlFor="pak-expiry">
                <Select id="pak-expiry" name="expiry" defaultValue={PERSONAL_KEY_DEFAULT}>
                  {PERSONAL_KEY_PRESETS.map((preset) => (
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

/** A pre-formatted timestamp, ready to render (see the page's `formatDate`). */
export interface FormattedDate {
  label: string;
  title: string;
}

export interface PersonalApiKeyRowData {
  id: string;
  name: string;
  created: FormattedDate;
  /** Null renders as "Never" - the key has no expiry. */
  expires: FormattedDate | null;
  /** Null renders as "Never" - the key has not authenticated a request yet. */
  lastUsed: FormattedDate | null;
}

/** One personal-API-key table row: the readout cells plus this row's actions. */
export function PersonalApiKeyRow({ entry }: { entry: PersonalApiKeyRowData }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setConfirmOpen(next);
    if (!next) setError(null);
  }

  function revoke() {
    startTransition(async () => {
      const result = await revokePersonalApiKey(entry.id);
      if (result.status === "success") {
        handleOpenChange(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Tr>
      <Td className="pl-4 font-medium text-ink">{entry.name}</Td>

      <Td data className="text-ink-muted" title={entry.created.title}>
        {entry.created.label}
      </Td>

      <Td data align="right" className="text-ink-muted" title={entry.expires?.title}>
        {entry.expires ? entry.expires.label : <span className="text-ink-faint">never</span>}
      </Td>

      <Td data align="right" className="text-ink-muted" title={entry.lastUsed?.title}>
        {entry.lastUsed ? entry.lastUsed.label : <span className="text-ink-faint">never</span>}
      </Td>

      <Td className="pr-4 text-right">
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Key actions"
                className="inline-flex h-7 w-7 items-center justify-center rounded-control text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40"
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                destructive
                onSelect={(event) => {
                  event.preventDefault();
                  setConfirmOpen(true);
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Revoke key
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Td>

      <Dialog open={confirmOpen} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke personal API key</DialogTitle>
            <DialogDescription>
              Permanently remove <span className="text-ink-faint">{entry.name}</span>.
              Anything using it loses access at once. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <DialogBody className="pt-0">
              <p className="flex items-start gap-1.5 text-xs text-critical-500">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {error}
              </p>
            </DialogBody>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="danger" size="sm" disabled={pending} onClick={revoke}>
              {pending ? "Revoking…" : "Revoke key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tr>
  );
}
