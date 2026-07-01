"use client";

import * as React from "react";
import Link from "next/link";
import {
  Check,
  CheckCircle2,
  KeyRound,
  Loader2,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/cn";
import { saveAuthentication } from "./actions";
import type { SessionSecretState } from "./session-secret";

type Mode = "operator" | "oidc";

export interface AuthenticationFormProps {
  /** The identity model currently in effect. */
  initialMode: Mode;
  /** Whether at least one identity provider is configured (Settings > Identity providers). */
  hasProviders: boolean;
  /** State of HEADTOWER_SESSION_SECRET (length only, never the value). */
  sessionSecret: SessionSecretState;
  /** Whether this session may change the identity model. */
  canWrite: boolean;
}

/**
 * The on/off switch for sign-in: operator mode (no sign-in) or single sign-on
 * (at least one identity provider). WHICH providers exist is managed entirely
 * on Settings > Identity providers - this page used to also hold a single
 * provider's issuer/client id/secret, which meant the same concept lived in
 * two places; that config now lives only there. Switching to operator mode
 * turns every provider off; switching back turns every existing one back on
 * (add one first if none exist yet). Blocked until HEADTOWER_SESSION_SECRET is
 * set, since sign-in signs its cookie with it.
 */
export function AuthenticationForm({
  initialMode,
  hasProviders,
  sessionSecret,
  canWrite,
}: AuthenticationFormProps) {
  const [mode, setMode] = React.useState<Mode>(initialMode);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<Mode | null>(null);

  const sessionSecretOk = sessionSecret.status === "ok";
  const canEnableOidc = hasProviders && sessionSecretOk;
  const canSave =
    canWrite && mode !== initialMode && (mode === "operator" || canEnableOidc);

  function select(next: Mode) {
    setMode(next);
    setError(null);
    setSaved(null);
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const result = await saveAuthentication({ mode });
      if (result.status === "success") {
        setSaved(result.mode);
      } else {
        setError(result.error);
      }
    } catch {
      setError("The change couldn't be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {!canWrite && (
        <p className="flex items-start gap-2 rounded-control border border-line bg-surface-2 px-3 py-2.5 text-xs text-ink-muted">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
          You can view the identity settings but not change them. This needs the{" "}
          <span className="data text-ink">settings.write</span> capability.
        </p>
      )}

      <div className="grid gap-3">
        <ChoiceCard
          selected={mode === "operator"}
          disabled={!canWrite}
          onSelect={() => select("operator")}
          icon={KeyRound}
          title="Operator mode"
          description="No sign-in. Anyone who can reach the console controls the tailnet, with the default role."
        />
        <ChoiceCard
          selected={mode === "oidc"}
          disabled={!canWrite}
          onSelect={() => select("oidc")}
          icon={ShieldCheck}
          title="Single sign-on"
          description="Operators sign in through an identity provider. Per-account roles and a full audit trail."
        />
      </div>

      {mode === "oidc" && !hasProviders && (
        <p className="flex items-start gap-2 rounded-control border border-line bg-surface-2 px-3 py-2.5 text-xs text-ink-muted">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
          No identity provider is configured yet.{" "}
          <Link
            href="/settings/identity-providers"
            className="font-medium text-beacon-500 transition-colors hover:text-beacon-400"
          >
            Add one
          </Link>{" "}
          to turn on single sign-on.
        </p>
      )}

      {mode === "oidc" && hasProviders && <SessionSecretNote state={sessionSecret} />}

      {mode === "operator" && initialMode === "oidc" && (
        <p className="flex items-start gap-2 rounded-control border border-warn-500/40 bg-warn-500/10 px-3 py-2.5 text-xs text-warn-500">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Saving switches off every identity provider. Existing sessions end and
          the console becomes reachable without signing in.
        </p>
      )}

      {saved && (
        <p className="flex items-start gap-2 rounded-control border border-online-600/40 bg-online-500/10 px-3 py-2.5 text-xs text-ink">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-online-500" aria-hidden />
          {saved === "oidc"
            ? "Single sign-on is on. New sign-ins go through your provider(s)."
            : "Switched to operator mode. Sign-in is now disabled."}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-control border border-critical-500/40 bg-critical-500/10 px-3 py-2.5 text-xs text-critical-500"
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {canWrite && (
        <div className="flex items-center justify-end border-t border-line pt-4">
          <Button variant="solid" onClick={onSave} disabled={saving || !canSave}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Saving...
              </>
            ) : mode === "operator" ? (
              "Switch to operator mode"
            ) : (
              "Turn on single sign-on"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Live readout of HEADTOWER_SESSION_SECRET - the env-only key OIDC signs with. */
function SessionSecretNote({ state }: { state: SessionSecretState }) {
  if (state.status === "ok") {
    return (
      <div className="flex items-start gap-2 rounded-control border border-line bg-surface px-3 py-2.5 text-xs text-ink-muted">
        <StatusDot status="online" className="mt-0.5" />
        <span>
          <span className="text-ink">Session secret is set</span> ({state.length}{" "}
          chars). It signs the login cookie and is read from the
          HEADTOWER_SESSION_SECRET environment variable. To change it, update
          that variable in your environment and redeploy (which signs everyone
          out).
        </span>
      </div>
    );
  }
  const critical = state.status === "missing";
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-control border px-3 py-2.5 text-xs",
        critical
          ? "border-critical-500/40 bg-critical-500/10 text-critical-500"
          : "border-warn-500/40 bg-warn-500/10 text-warn-500",
      )}
    >
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        {critical
          ? "HEADTOWER_SESSION_SECRET is not set. "
          : `HEADTOWER_SESSION_SECRET is too short (${state.length} chars). `}
        Single sign-on signs its cookie with it. Set it to 32+ characters of
        randomness in the environment, then turn this on.
      </span>
    </div>
  );
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
