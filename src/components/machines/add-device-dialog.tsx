"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Eye, EyeOff, LaptopMinimal, TriangleAlert } from "lucide-react";
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
import { CopyButton } from "@/components/ui/copy-button";
import { Tag } from "@/components/ui/chip";
import { cn } from "@/lib/cn";
import {
  PRE_AUTH_KEY_DEFAULT,
  PRE_AUTH_KEY_PRESETS,
} from "@/app/(app)/settings/expiry-presets";
import {
  createDeviceKey,
  type CreateDeviceKeyState,
} from "@/app/(app)/machines/add-device-actions";

export interface UserOption {
  id: string;
  /** Operator-facing label (display name, falling back to handle). */
  label: string;
  /** The `@handle`, shown when it differs from the label. */
  handle: string;
}

export interface AddDeviceDialogProps {
  users: UserOption[];
  trigger?: React.ReactNode;
}

/** The success branch of {@link CreateDeviceKeyState} — what the reveal step renders. */
type CreatedDevice = Extract<CreateDeviceKeyState, { status: "success" }>;

type DeviceOS = "macos" | "linux" | "windows" | "ios" | "android";

const OS_TABS: { id: DeviceOS; label: string }[] = [
  { id: "macos", label: "macOS" },
  { id: "linux", label: "Linux" },
  { id: "windows", label: "Windows" },
  { id: "ios", label: "iOS" },
  { id: "android", label: "Android" },
];

/**
 * Add-device dialog. A two-phase modal: a form (owner, reuse, ephemeral,
 * expiry) that calls the `createDeviceKey` Server Action, then a reveal phase
 * showing the minted key plus a per-OS `tailscale up` command. Closing resets it.
 */
export function AddDeviceDialog({ users, trigger }: AddDeviceDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedDevice | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setError(null);
    setCreated(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const state = await createDeviceKey({ status: "idle" }, formData);
      if (state.status === "success") {
        setError(null);
        setCreated(state);
      } else if (state.status === "error") {
        setError(state.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="solid" size="sm">
            <LaptopMinimal className="h-4 w-4" aria-hidden />
            Add device
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{created ? "Device key created" : "Add device"}</DialogTitle>
          <DialogDescription>
            {created
              ? "Copy the key now, then run the matching command on the device."
              : "Mint a pre-auth key and get the matching `tailscale up` command for it."}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <>
            <DialogBody className="flex flex-col gap-4">
              <KeyReveal value={created.key} />
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                <span>{created.user}</span>
                {created.reusable ? <Tag>reusable</Tag> : <Tag>single-use</Tag>}
                {created.ephemeral && <Tag>ephemeral</Tag>}
                <Tag>{formatExpiry(created.expiration)}</Tag>
              </div>
              <OsCommandTabs device={created} />
              <p className="flex items-start gap-1.5 text-xs text-ink-faint">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Keys are shown once — copy it now, it can&apos;t be retrieved again.
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
                label="User"
                htmlFor="add-device-user"
                required
                description="The device is enrolled and assigned to this user."
              >
                <Select id="add-device-user" name="user" defaultValue={users[0]?.id}>
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

              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-muted">
                  Properties
                </legend>
                <CheckRow
                  name="reusable"
                  label="Reusable"
                  description="Enrol more than one device with this key."
                />
                <CheckRow
                  name="ephemeral"
                  label="Ephemeral"
                  description="The device is removed automatically when it goes offline."
                />
              </fieldset>

              <Field label="Expiry" htmlFor="add-device-expiry">
                <Select
                  id="add-device-expiry"
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
              <Button
                type="submit"
                variant="solid"
                disabled={pending || users.length === 0}
              >
                {pending ? "Creating…" : "Create key"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
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
  const id = `add-device-${name}`;
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

/** The minted key: masked by default, with a reveal toggle and a copy control. */
function KeyReveal({ value }: { value: string }) {
  const [revealed, setRevealed] = useState(false);
  const masked = "•".repeat(Math.min(value.length, 40));
  return (
    <div className="flex items-start gap-2 rounded-control border border-line-strong bg-surface-2 p-3">
      <code className="data min-w-0 flex-1 break-all text-xs leading-relaxed text-ink">
        {revealed ? value : masked}
      </code>
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        aria-label={revealed ? "Hide key" : "Reveal key"}
        className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[0.3rem] text-ink-faint transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40"
      >
        {revealed ? (
          <EyeOff className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Eye className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>
      <CopyButton value={value} label="Copy key" className="mt-0.5" />
    </div>
  );
}

/** A mono value in a copyable box — the per-OS command, or the bare key for mobile. */
function CommandBox({ value, copyLabel }: { value: string; copyLabel: string }) {
  return (
    <div className="flex items-start gap-2 rounded-control border border-line-strong bg-surface-2 p-3">
      <code className="data min-w-0 flex-1 break-all text-xs leading-relaxed text-ink">
        {value}
      </code>
      <CopyButton value={value} label={copyLabel} className="mt-0.5" />
    </div>
  );
}

/**
 * Per-OS enrolment instructions: a segmented control over the platform (adapted
 * from the Machines view toggle) switching between a ready-to-paste
 * `tailscale up` command (desktop) and a short manual-enrolment note (mobile,
 * where there is no CLI to paste a flag into).
 */
function OsCommandTabs({ device }: { device: CreatedDevice }) {
  const [os, setOs] = useState<DeviceOS>("macos");
  const internal = looksInternal(device.loginServerUrl);
  const server = internal ? "<your-headscale-url>" : device.loginServerUrl;
  const isMobile = os === "ios" || os === "android";

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex flex-wrap items-center gap-0.5 rounded-control border border-line bg-surface-2 p-0.5"
        role="tablist"
        aria-label="Device platform"
      >
        {OS_TABS.map(({ id, label }) => {
          const isActive = os === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setOs(id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[0.4rem] px-2.5 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "bg-surface text-ink shadow-sm"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {isMobile ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-ink-muted">
            Install Tailscale, add an account, choose Custom / self-hosted, enter{" "}
            <code className="data text-ink">{server}</code>, then this key.
          </p>
          <CommandBox value={device.key} copyLabel="Copy key" />
        </div>
      ) : (
        <CommandBox
          value={`tailscale up --login-server ${server} --authkey ${device.key}`}
          copyLabel="Copy command"
        />
      )}

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

// Hosts that only resolve inside the deploy's own network — a `tailscale up`
// command built from one of these means nothing off-box, so the tabs swap in a
// placeholder and point the operator at the setting that fixes it.
function looksInternal(url: string): boolean {
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

function formatExpiry(ts: string | null): string {
  if (!ts) return "no expiry";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "no expiry";
  return `expires ${date.toISOString().slice(0, 10)}`;
}
