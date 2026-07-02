"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import Link from "next/link";
import { KeyRound, TriangleAlert } from "lucide-react";
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
import { Field, Select } from "@/components/ui/field";
import { TokenInput } from "@/components/ui/token-input";
import { SecretReveal } from "../secret-reveal";
import {
  PRE_AUTH_KEY_DEFAULT,
  PRE_AUTH_KEY_PRESETS,
} from "../expiry-presets";
import { createPreAuthKey } from "./actions";
import { normalizeAclTags } from "./tags";

export interface UserOption {
  id: string;
  /** Operator-facing label (display name, falling back to handle). */
  label: string;
  /** The `@handle`, shown when it differs from the label. */
  handle: string;
}

export interface CreatePreAuthKeyDialogProps {
  users: UserOption[];
  trigger?: React.ReactNode;
  /**
   * Public login-server URL from Settings > Connection ("" or unset when none).
   * Used to build a ready-to-paste `tailscale up` command beside the minted key;
   * when absent it falls back to a `<your-headscale-url>` placeholder.
   */
  loginServerUrl?: string;
}

/**
 * Create-pre-auth-key dialog. A two-phase modal: a form (owner, reuse,
 * ephemeral, expiry) that calls the `createPreAuthKey` Server Action, then a
 * reveal phase showing the minted key with a copy control. Closing resets it.
 */
export function CreatePreAuthKeyDialog({
  users,
  trigger,
  loginServerUrl,
}: CreatePreAuthKeyDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function reset() {
    setError(null);
    setCreatedKey(null);
    setTags([]);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createPreAuthKey({ status: "idle" }, formData);
      if (result.status === "success") {
        setError(null);
        setCreatedKey(result.key);
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
            <KeyRound className="h-4 w-4" aria-hidden />
            Create key
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {createdKey ? "Pre-auth key created" : "Create pre-auth key"}
          </DialogTitle>
          <DialogDescription>
            {createdKey
              ? "Copy the key now. Pass it to a node with `tailscale up --authkey`."
              : "A token that enrols nodes against a user without an interactive login."}
          </DialogDescription>
        </DialogHeader>

        {createdKey ? (
          <>
            <DialogBody className="flex flex-col gap-3">
              <SecretReveal value={createdKey} />
              <EnrolCommand loginServerUrl={loginServerUrl} authKey={createdKey} />
              <p className="flex items-start gap-1.5 text-xs text-ink-faint">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Keys are shown once — copy it now, it can&apos;t be retrieved
                again.
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
                label="Owner"
                htmlFor="pak-user"
                required
                description="Nodes enrolled with this key are assigned to this user."
              >
                <Select id="pak-user" name="user" defaultValue={users[0]?.id}>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.label}
                      {user.handle && user.handle !== user.label
                        ? ` (@${user.handle})`
                        : ""}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Expiry" htmlFor="pak-expiry">
                <Select
                  id="pak-expiry"
                  name="expiry"
                  defaultValue={PRE_AUTH_KEY_DEFAULT}
                >
                  {PRE_AUTH_KEY_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted">
                  Properties
                </legend>
                <CheckRow
                  name="reusable"
                  label="Reusable"
                  description="Enrol more than one node with this key."
                />
                <CheckRow
                  name="ephemeral"
                  label="Ephemeral"
                  description="Nodes are removed automatically when they go offline."
                />
              </fieldset>

              <Field
                label="Tags"
                htmlFor="pak-tags"
                description="ACL tags applied to nodes enrolled with this key, e.g. server, prod. The tag: prefix is added automatically."
              >
                <TokenInput
                  id="pak-tags"
                  ariaLabel="Pre-auth key tags"
                  values={tags}
                  onChange={(next) => setTags(normalizeAclTags(next))}
                  placeholder="server, prod"
                />
                {tags.map((tag) => (
                  <input key={tag} type="hidden" name="tags" value={tag} />
                ))}
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

/**
 * Ready-to-paste `tailscale up` command built around the minted key (the
 * Headplane show-secret-once pattern). When no public login-server URL is
 * configured, it renders a `<your-headscale-url>` placeholder and points at the
 * setting that fixes it, so the command is still copyable and self-explanatory.
 */
function EnrolCommand({
  loginServerUrl,
  authKey,
}: {
  loginServerUrl?: string;
  authKey: string;
}) {
  const internal = looksInternal(loginServerUrl);
  const server = internal ? "<your-headscale-url>" : (loginServerUrl as string);
  const command = `tailscale up --login-server ${server} --authkey ${authKey}`;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">
        Enrolment command
      </span>
      <div className="flex items-start gap-2 rounded-control border border-line-strong bg-surface-2 p-3">
        <code className="data min-w-0 flex-1 break-all text-xs leading-relaxed text-ink">
          {command}
        </code>
        <CopyButton value={command} label="Copy command" className="mt-0.5" />
      </div>
      {internal && (
        <p className="text-xs text-ink-faint">
          No public login-server URL is set, so the placeholder above needs a
          manual swap. Set one in{" "}
          <Link
            href="/settings/connection"
            className="text-beacon-500 transition-colors hover:text-beacon-400"
          >
            Settings &gt; Connection
          </Link>{" "}
          for a ready-to-paste command next time.
        </p>
      )}
    </div>
  );
}

// Hosts that only resolve inside the deploy's own network - a `tailscale up`
// command built from one means nothing off-box, so we swap in a placeholder.
function looksInternal(url?: string): boolean {
  if (!url) return true;
  try {
    const { hostname } = new URL(url);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".docker.internal")
    );
  } catch {
    return true;
  }
}

function CheckRow({
  name,
  label,
  description,
}: {
  name: string;
  label: string;
  description: string;
}) {
  const id = `pak-${name}`;
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2.5 rounded-control border border-line bg-surface-2 px-3 py-2.5 transition-colors hover:border-line-strong"
    >
      <input
        id={id}
        name={name}
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-beacon-500"
      />
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-medium text-ink">{label}</span>
        <span className="text-xs text-ink-faint">{description}</span>
      </span>
    </label>
  );
}
