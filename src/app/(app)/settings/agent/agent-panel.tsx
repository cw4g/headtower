"use client";

import * as React from "react";
import {
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Power,
  PowerOff,
  RotateCw,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field, Input } from "@/components/ui/field";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/cn";
import { probeAgent, saveAgent } from "./actions";

type ProbeResult = Awaited<ReturnType<typeof probeAgent>>;

/** Whether the stored SSH secret is usable, unreadable (secret rotated), or absent. */
export type SecretStatus = "set" | "unreadable" | "unset";

export interface AgentPanelProps {
  /** Current agent base URL, if any. */
  initialUrl: string;
  /** Whether the agent is currently enabled. */
  initialEnabled: boolean;
  /** State of the stored SSH secret (never the secret itself). */
  secretStatus: SecretStatus;
  /** Where the stored secret resolves from, when set. */
  secretSource: "db" | "env" | "none";
  /** Health probe taken when the page rendered. */
  initialHealth: ProbeResult;
  /** The Headscale login-server URL, for context in the explainer copy. */
  loginServerUrl: string | null;
  /** Whether this session may edit the agent settings. */
  canWrite: boolean;
}

/**
 * Editable agent sidecar settings: enabled/disabled, base URL, and the shared
 * SSH secret. The secret is masked - a stored one shows only as "set" with a
 * Change control, and the raw value never reaches the browser; leaving the
 * field blank while editing and saving clears it outright. A health card shows
 * the last probe (from the server render, or a fresh "Re-test") so an operator
 * can confirm the sidecar is actually reachable before relying on it.
 */
export function AgentPanel({
  initialUrl,
  initialEnabled,
  secretStatus,
  secretSource,
  initialHealth,
  loginServerUrl,
  canWrite,
}: AgentPanelProps) {
  const hasStoredSecret = secretStatus === "set";

  const [url, setUrl] = React.useState(initialUrl);
  const [enabled, setEnabled] = React.useState(initialEnabled);
  // When there is no usable stored secret the input is always open; otherwise
  // the operator opts in to changing it via the Change control.
  const [changingSecret, setChangingSecret] = React.useState(!hasStoredSecret);
  const [sshSecret, setSshSecret] = React.useState("");
  const [reveal, setReveal] = React.useState(false);

  const [health, setHealth] = React.useState<ProbeResult>(initialHealth);
  const [probing, setProbing] = React.useState(false);

  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const secretInputOpen = changingSecret;
  const urlProvided = url.trim().length > 0;

  /** Any edit to the inputs invalidates the last save banner. */
  function invalidate() {
    setSaved(false);
  }

  async function onProbe() {
    setProbing(true);
    try {
      setHealth(await probeAgent());
    } finally {
      setProbing(false);
    }
  }

  async function onSave() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const result = await saveAgent({
        url: url.trim(),
        enabled,
        // Collapsed = leave the stored secret untouched; open = whatever is
        // typed, including blank, which clears it.
        sshSecret: changingSecret ? sshSecret.trim() : null,
      });
      if (result.status === "success") {
        setSaved(true);
        setSshSecret("");
        setReveal(false);
        setChangingSecret(false); // A secret is now either stored or cleared; collapse.
        setHealth(await probeAgent()); // URL/enabled may have changed - refresh the readout.
      } else {
        setSaveError(result.error);
      }
    } catch {
      setSaveError("The agent settings couldn't be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="rounded-control border border-line bg-surface-2 px-3.5 py-3 text-xs leading-relaxed text-ink-muted">
        The agent is a small, optional sidecar (tsnet) that joins your tailnet
        {loginServerUrl ? ` at ${hostOf(loginServerUrl)}` : ""} to report
        richer device metadata than Headscale&apos;s API alone provides, and to
        bridge browser-based SSH sessions to your machines. Headtower works
        without it - leave it unconfigured, or turn it off below, and machines
        just show what Headscale reports, with no in-browser terminal.
      </p>

      {!canWrite && (
        <p className="flex items-start gap-2 rounded-control border border-line bg-surface-2 px-3 py-2.5 text-xs text-ink-muted">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
          You can view the agent settings but not change them. This needs the{" "}
          <span className="data text-ink">settings.write</span> capability.
        </p>
      )}

      <HealthCard health={health} probing={probing} canWrite={canWrite} onProbe={onProbe} />

      <div className="grid gap-3">
        <ChoiceCard
          selected={enabled}
          disabled={!canWrite}
          onSelect={() => {
            setEnabled(true);
            invalidate();
          }}
          icon={Power}
          title="Enabled"
          description="Headtower reads device metadata from the agent and offers browser SSH where it's reachable."
        />
        <ChoiceCard
          selected={!enabled}
          disabled={!canWrite}
          onSelect={() => {
            setEnabled(false);
            invalidate();
          }}
          icon={PowerOff}
          title="Disabled"
          description="Headtower ignores the sidecar entirely - device metadata and browser SSH both turn off."
        />
      </div>

      <Field
        label="Agent URL"
        htmlFor="agent-url"
        description="The in-cluster address of the agent sidecar, e.g. http://agent:8410."
      >
        <Input
          id="agent-url"
          mono
          value={url}
          spellCheck={false}
          autoComplete="off"
          disabled={!canWrite}
          placeholder="http://agent:8410"
          onChange={(e) => {
            setUrl(e.target.value);
            invalidate();
          }}
        />
      </Field>

      <Field
        label="SSH secret"
        htmlFor="agent-secret"
        description={
          secretInputOpen
            ? "Signs browser-SSH tokens - must match the agent's HEADTOWER_AGENT_SSH_SECRET. Leave blank and save to clear it."
            : undefined
        }
      >
        {secretInputOpen ? (
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Input
                id="agent-secret"
                mono
                type={reveal ? "text" : "password"}
                value={sshSecret}
                spellCheck={false}
                autoComplete="off"
                disabled={!canWrite}
                placeholder={hasStoredSecret ? "Paste a new secret to rotate" : "Shared secret (optional)"}
                className="pr-10"
                onChange={(e) => {
                  setSshSecret(e.target.value);
                  invalidate();
                }}
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? "Hide SSH secret" : "Show SSH secret"}
                className="absolute right-2 top-1/2 flex -translate-y-1/2 text-ink-faint transition-colors hover:text-ink"
              >
                {reveal ? (
                  <EyeOff className="h-4 w-4" aria-hidden />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden />
                )}
              </button>
            </div>
            {hasStoredSecret && canWrite && (
              <button
                type="button"
                onClick={() => {
                  setChangingSecret(false);
                  setSshSecret("");
                  setReveal(false);
                  invalidate();
                }}
                className="inline-flex w-fit items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-ink"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Keep the current secret
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-control border border-line-strong bg-surface-2 px-3 py-2">
            <div className="flex items-center gap-2">
              <StatusDot status="online" />
              <span className="text-sm text-ink">A secret is stored</span>
              <Chip variant="default" mono>
                {secretSource === "env" ? "from env" : "in db"}
              </Chip>
            </div>
            {canWrite && (
              <button
                type="button"
                onClick={() => {
                  setChangingSecret(true);
                  invalidate();
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-beacon-500 transition-colors hover:text-beacon-400"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Change secret
              </button>
            )}
          </div>
        )}
      </Field>

      {secretStatus === "unreadable" && (
        <p className="flex items-start gap-2 rounded-control border border-warn-500/40 bg-warn-500/10 px-3 py-2.5 text-xs text-warn-500">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          A secret is stored but can&apos;t be decrypted - HEADTOWER_SECRET was
          changed or removed. Paste the secret again to restore browser SSH.
        </p>
      )}

      {saved && (
        <p className="flex items-start gap-2 rounded-control border border-online-600/40 bg-online-500/10 px-3 py-2.5 text-xs text-ink">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-online-500" aria-hidden />
          Agent settings saved. It takes effect immediately - no restart needed.
        </p>
      )}

      {saveError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-control border border-critical-500/40 bg-critical-500/10 px-3 py-2.5 text-xs text-critical-500"
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {saveError}
        </p>
      )}

      {canWrite && (
        <div className="flex items-center justify-end border-t border-line pt-4">
          <Button variant="solid" onClick={onSave} disabled={saving || !urlProvided}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Saving...
              </>
            ) : (
              "Save agent settings"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Live reachability readout, with a manual "Re-test" control. */
function HealthCard({
  health,
  probing,
  canWrite,
  onProbe,
}: {
  health: ProbeResult;
  probing: boolean;
  canWrite: boolean;
  onProbe: () => void;
}) {
  const tone = healthTone(health);
  const detail = health.reachable
    ? [health.service, health.status, health.latencyMs != null ? `${health.latencyMs}ms` : null]
        .filter(Boolean)
        .join(" · ") || "No further detail reported."
    : health.error;

  return (
    <div className="flex items-center justify-between gap-3 rounded-control border border-line bg-surface px-4 py-3">
      <div className="flex items-center gap-3">
        <StatusDot status={tone} pulse={tone === "online"} />
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-ink">
            {health.reachable ? "Agent reachable" : "Agent unreachable"}
          </p>
          <p className="data text-xs text-ink-muted">{detail}</p>
        </div>
      </div>
      {canWrite && (
        <Button variant="outline" size="sm" onClick={onProbe} disabled={probing}>
          {probing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Testing...
            </>
          ) : (
            <>
              <RotateCw className="h-3.5 w-3.5" aria-hidden />
              Re-test
            </>
          )}
        </Button>
      )}
    </div>
  );
}

/** Green when reachable; amber when off/unconfigured (expected); red on a real fault. */
function healthTone(health: ProbeResult): "online" | "warn" | "critical" {
  if (health.reachable) return "online";
  if (health.error === "Agent is turned off" || health.error === "No agent URL is configured") {
    return "warn";
  }
  return "critical";
}

function ChoiceCard({
  selected,
  disabled,
  onSelect,
  icon: Icon,
  title,
  description,
}: {
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "flex items-start gap-3 rounded-control border px-4 py-3 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40",
        "disabled:cursor-default disabled:opacity-60",
        selected
          ? "border-beacon-500 bg-beacon-500/5"
          : "border-line-strong bg-surface enabled:hover:bg-surface-2",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control border",
          selected
            ? "border-beacon-500/50 bg-beacon-500/10 text-beacon-500"
            : "border-line text-ink-muted",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-ink">{title}</span>
        <span className="text-xs text-ink-muted">{description}</span>
      </span>
      <span
        className={cn(
          "ml-auto mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-beacon-500 bg-beacon-500 text-graphite-950" : "border-line-strong",
        )}
      >
        {selected && <Check className="h-3 w-3" aria-hidden />}
      </span>
    </button>
  );
}

/** Host (and port) of a URL, for the explainer copy. Falls back to the raw string. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
