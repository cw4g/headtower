"use client";

import * as React from "react";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  LaptopMinimal,
  TriangleAlert,
} from "lucide-react";
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
import { Field, Input, Select } from "@/components/ui/field";
import { CopyButton } from "@/components/ui/copy-button";
import { Tag } from "@/components/ui/chip";
import { cn } from "@/lib/cn";
import {
  PRE_AUTH_KEY_DEFAULT,
  PRE_AUTH_KEY_PRESETS,
} from "@/app/(app)/settings/expiry-presets";
import {
  createDeviceKey,
  registerDevice,
  type CreateDeviceKeyState,
  type RegisterDeviceState,
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
  /**
   * Public login-server URL from Settings > Connection ("" when unset). The
   * "create key" mode gets this back from `createDeviceKey`, but "use existing
   * key" builds its command box with no server round trip, so it needs the URL
   * up front.
   */
  loginServerUrl: string;
  trigger?: React.ReactNode;
}

/** The success branch of {@link CreateDeviceKeyState} — what the "create key" reveal step renders. */
type CreatedDevice = Extract<CreateDeviceKeyState, { status: "success" }>;

/** The success branch of {@link RegisterDeviceState} — what the "register device" confirmation renders. */
type RegisteredDevice = Extract<RegisterDeviceState, { status: "success" }>;

type DeviceOS = "macos" | "linux" | "windows" | "ios" | "android";

const OS_TABS: { id: DeviceOS; label: string }[] = [
  { id: "macos", label: "macOS" },
  { id: "linux", label: "Linux" },
  { id: "windows", label: "Windows" },
  { id: "ios", label: "iOS" },
  { id: "android", label: "Android" },
];

type Mode = "create" | "existing" | "register";

const MODE_TABS: { id: Mode; label: string }[] = [
  { id: "create", label: "Create key" },
  { id: "existing", label: "Use existing key" },
  { id: "register", label: "Register device" },
];

/**
 * Add-device dialog. A segmented control at the top picks one of three
 * enrolment flows, each keeping its own two-phase shape (form -> result):
 *   - Create key (default): mints a pre-auth key via the `createDeviceKey`
 *     Server Action, then reveals it plus a per-OS `tailscale up` command.
 *   - Use existing key: no server call - paste a key already in hand and get
 *     the same per-OS command built around it.
 *   - Register device: for a device that already ran `tailscale up
 *     --login-server` with no authkey and is holding a registration key;
 *     calls the `registerDevice` Server Action to finish the enrolment.
 * Switching modes or closing the dialog resets whatever was in progress.
 */
export function AddDeviceDialog({
  users,
  loginServerUrl,
  trigger,
}: AddDeviceDialogProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [pending, startTransition] = useTransition();

  // "Create key" mode.
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedDevice | null>(null);

  // "Use existing key" mode - nothing hits the server, so the command box
  // just tracks the pasted value.
  const [existingKey, setExistingKey] = useState("");

  // "Register device" mode.
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registered, setRegistered] = useState<RegisteredDevice | null>(null);

  /** Clears every mode's transient state - the minted key, the pasted key, the result. */
  function reset() {
    setError(null);
    setCreated(null);
    setExistingKey("");
    setRegisterError(null);
    setRegistered(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      reset();
      setMode("create");
    }
  }

  function handleModeChange(next: Mode) {
    if (next === mode) return;
    setMode(next);
    reset();
  }

  function handleCreateSubmit(event: React.FormEvent<HTMLFormElement>) {
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

  function handleRegisterSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const user = String(formData.get("user") ?? "").trim();
    const key = extractRegistrationKey(String(formData.get("key") ?? ""));
    startTransition(async () => {
      const state = await registerDevice({ user, key });
      if (state.status === "success") {
        setRegisterError(null);
        setRegistered(state);
      } else {
        setRegisterError(state.error);
      }
    });
  }

  const { title, description } = dialogCopy(mode, created, registered);

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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {mode === "existing" ? (
          <>
            <DialogBody className="flex flex-col gap-4">
              <ModeTabs mode={mode} onChange={handleModeChange} disabled={pending} />
              <ExistingKeyPanel
                loginServerUrl={loginServerUrl}
                value={existingKey}
                onChange={setExistingKey}
              />
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="solid">Done</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : mode === "create" ? (
          created ? (
            <>
              <DialogBody className="flex flex-col gap-4">
                <ModeTabs mode={mode} onChange={handleModeChange} disabled={pending} />
                <KeyReveal value={created.key} />
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                  <span>{created.user}</span>
                  {created.reusable ? <Tag>reusable</Tag> : <Tag>single-use</Tag>}
                  {created.ephemeral && <Tag>ephemeral</Tag>}
                  <Tag>{formatExpiry(created.expiration)}</Tag>
                </div>
                <OsCommandTabs
                  loginServerUrl={created.loginServerUrl}
                  deviceKey={created.key}
                />
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
            <form onSubmit={handleCreateSubmit}>
              <DialogBody className="flex flex-col gap-4">
                <ModeTabs mode={mode} onChange={handleModeChange} disabled={pending} />
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
          )
        ) : registered ? (
          <>
            <DialogBody className="flex flex-col gap-4">
              <ModeTabs mode={mode} onChange={handleModeChange} disabled={pending} />
              <p className="flex items-start gap-2 rounded-control border border-online-600/40 bg-online-500/10 px-3 py-2.5 text-xs text-ink">
                <CheckCircle2
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-online-500"
                  aria-hidden
                />
                Device registered, it now appears in Machines.
              </p>
              <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                <span>Enrolled as</span>
                <Tag>{registered.nodeName}</Tag>
              </div>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="solid">Done</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleRegisterSubmit}>
            <DialogBody className="flex flex-col gap-4">
              <ModeTabs mode={mode} onChange={handleModeChange} disabled={pending} />
              <RegisterCommandHint loginServerUrl={loginServerUrl} />

              <Field
                label="User"
                htmlFor="add-device-register-user"
                required
                description="The device is enrolled and assigned to this user."
              >
                <Select
                  id="add-device-register-user"
                  name="user"
                  defaultValue={users[0]?.id}
                >
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

              <Field
                label="Registration key"
                htmlFor="add-device-register-key"
                required
                description="Paste the key, or the whole URL the device printed - the key is pulled out of either."
              >
                <Input
                  id="add-device-register-key"
                  name="key"
                  mono
                  placeholder="Paste the registration key"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>

              {registerError && (
                <p className="flex items-start gap-1.5 text-xs text-critical-500">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  {registerError}
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
                {pending ? "Registering…" : "Register device"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Dialog title/description for the active mode and its current phase. */
function dialogCopy(
  mode: Mode,
  created: CreatedDevice | null,
  registered: RegisteredDevice | null,
): { title: string; description: string } {
  if (mode === "create") {
    return created
      ? {
          title: "Device key created",
          description: "Copy the key now, then run the matching command on the device.",
        }
      : {
          title: "Add device",
          description: "Mint a pre-auth key and get the matching `tailscale up` command for it.",
        };
  }
  if (mode === "existing") {
    return {
      title: "Add device",
      description: "Build the enrolment command for a key you already have — no new key is minted.",
    };
  }
  return registered
    ? { title: "Device registered", description: "It now appears in Machines." }
    : {
        title: "Add device",
        description: "Finish a login the device already started, using the registration key it printed.",
      };
}

/**
 * Top-of-dialog segmented control choosing which of the three Add device
 * flows is active (same styling as the per-OS command tabs below). Switching
 * modes discards whatever the previous mode had in progress.
 */
function ModeTabs({
  mode,
  onChange,
  disabled,
}: {
  mode: Mode;
  onChange: (next: Mode) => void;
  disabled: boolean;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-0.5 rounded-control border border-line bg-surface-2 p-0.5"
      role="tablist"
      aria-label="Add device mode"
    >
      {MODE_TABS.map(({ id, label }) => {
        const isActive = mode === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={disabled}
            onClick={() => onChange(id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[0.4rem] px-2.5 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
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
  );
}

/**
 * "Use existing key" mode: a field to paste a key the operator already has,
 * plus the same per-OS command box the "create key" reveal uses, built live
 * around the pasted value once there is one. No Server Action involved.
 */
function ExistingKeyPanel({
  loginServerUrl,
  value,
  onChange,
}: {
  loginServerUrl: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const trimmed = value.trim();
  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Pre-auth key"
        htmlFor="add-device-existing-key"
        required
        description="Paste a key from `headscale preauthkeys create`, or one you saved earlier."
      >
        <Input
          id="add-device-existing-key"
          mono
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Paste the pre-auth key"
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      {trimmed ? (
        <OsCommandTabs loginServerUrl={loginServerUrl} deviceKey={trimmed} />
      ) : (
        <p className="text-xs text-ink-faint">
          The matching command appears here once a key is pasted.
        </p>
      )}
    </div>
  );
}

/**
 * "Register device" mode's opening instructions: the command to run on the
 * device with no authkey, and what it prints. Reuses the same "internal URL"
 * placeholder treatment as {@link OsCommandTabs}.
 */
function RegisterCommandHint({ loginServerUrl }: { loginServerUrl: string }) {
  const internal = looksInternal(loginServerUrl);
  const server = internal ? "<your-headscale-url>" : loginServerUrl;
  const command = `tailscale up --login-server ${server}`;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-ink-muted">
        On the device, run this with no authkey. It prints a registration key
        — a <code className="data text-ink">nodekey:...</code> value, or a URL
        ending in one.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <CommandBox value={command} copyLabel="Copy command" />
        <QrCard value={command} caption="Scan to copy the command" />
      </div>
      {internal && <InternalUrlHint />}
    </div>
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
 * Bordered card holding a scannable QR code for `value`, with a one-line
 * caption underneath - sits next to a {@link CommandBox} so a phone can grab
 * its contents with a camera instead of retyping them from the screen.
 */
function QrCard({ value, caption }: { value: string; caption: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5 rounded-control border border-line bg-surface p-3">
      <QrCodeSvg value={value} />
      <p className="max-w-[140px] text-center text-[11px] text-ink-faint">{caption}</p>
    </div>
  );
}

/**
 * Renders `value` as an inline SVG QR code, regenerated whenever it changes.
 * Encoding happens fully client-side via the `qrcode` package - no network
 * round trip, so it works on a fully offline / self-hosted deploy.
 */
function QrCodeSvg({ value }: { value: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, { type: "svg", margin: 1, width: 128 }, (error, markup) => {
      if (!cancelled && !error) setSvg(markup);
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!svg) {
    return <div className="h-32 w-32 animate-pulse rounded-[0.3rem] bg-surface-2" aria-hidden />;
  }

  return (
    <span
      className="block h-32 w-32 [&_svg]:h-full [&_svg]:w-full"
      role="img"
      aria-label="QR code for the enrolment command"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * Per-OS enrolment instructions: a segmented control over the platform (adapted
 * from the Machines view toggle) switching between a ready-to-paste
 * `tailscale up` command (desktop) and a short manual-enrolment note (mobile,
 * where there is no CLI to paste a flag into). Takes the login-server URL and
 * key as plain values so both the "create key" reveal and the "use existing
 * key" panel can drive it.
 */
function OsCommandTabs({
  loginServerUrl,
  deviceKey,
}: {
  loginServerUrl: string;
  deviceKey: string;
}) {
  const [os, setOs] = useState<DeviceOS>("macos");
  const internal = looksInternal(loginServerUrl);
  const server = internal ? "<your-headscale-url>" : loginServerUrl;
  const isMobile = os === "ios" || os === "android";
  // Same string for every platform - the desktop command box copies it
  // verbatim, and the mobile QR bundles it too, since scanning can't run a
  // command but it still carries the server and key together in one read.
  const command = `tailscale up --login-server ${server} --authkey ${deviceKey}`;

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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <CommandBox value={deviceKey} copyLabel="Copy key" />
            <QrCard value={command} caption="Scan for the server and key" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <CommandBox value={command} copyLabel="Copy command" />
          <QrCard value={command} caption="Scan to copy the command" />
        </div>
      )}

      {internal && <InternalUrlHint />}
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

/** Points at Settings > Connection when the login-server URL needs a manual swap. */
function InternalUrlHint() {
  return (
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
  );
}

function formatExpiry(ts: string | null): string {
  if (!ts) return "no expiry";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "no expiry";
  return `expires ${date.toISOString().slice(0, 10)}`;
}

// A device running an interactive `tailscale up --login-server` (no authkey)
// prints either a bare registration key or a line built around one - a
// `nodekey:...` token, or a URL ending in `/register/<key>`. Operators tend to
// paste the whole line, so pull just the key out of either shape.
function extractRegistrationKey(raw: string): string {
  const trimmed = raw.trim();
  const nodeKeyMatch = trimmed.match(/nodekey:\S+/);
  if (nodeKeyMatch) return nodeKeyMatch[0];
  const urlMatch = trimmed.match(/\/register\/([^/\s?#]+)/);
  if (urlMatch) return urlMatch[1];
  return trimmed;
}
