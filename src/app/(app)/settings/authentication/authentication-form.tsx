"use client";

import * as React from "react";
import {
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Pencil,
  ShieldCheck,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field, Input } from "@/components/ui/field";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/cn";
import { saveAuthentication, type SaveAuthInput } from "./actions";
import type { SessionSecretState } from "./session-secret";

type Mode = "operator" | "oidc";

interface ProviderPreset {
  id: string;
  label: string;
  /** Issuer URL to prefill. Blank leaves the field empty for the user to fill in. */
  issuer: string;
  /** Shown under the Issuer field once this preset is selected. */
  hint?: string;
}

/**
 * Common identity providers, OIDC-discovery compatible only (so no GitHub,
 * which is OAuth2 without an OIDC discovery document). Selecting one only
 * prefills the Issuer field below - it never touches client id or secret.
 */
const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: "google", label: "Google", issuer: "https://accounts.google.com" },
  {
    id: "entra",
    label: "Microsoft Entra",
    issuer: "https://login.microsoftonline.com/<tenant>/v2.0",
    hint: 'Replace <tenant> with your Entra tenant ID, or "common" for multi-tenant apps.',
  },
  {
    id: "okta",
    label: "Okta",
    issuer: "https://YOUR_DOMAIN.okta.com",
    hint: "Replace YOUR_DOMAIN with your Okta org domain.",
  },
  {
    id: "auth0",
    label: "Auth0",
    issuer: "https://YOUR_TENANT.auth0.com",
    hint: "Replace YOUR_TENANT with your Auth0 tenant.",
  },
  {
    id: "pocket-id",
    label: "Pocket ID",
    issuer: "",
    hint: "Self-hosted. Enter your Pocket ID instance's URL, e.g. https://id.example.com.",
  },
  { id: "generic", label: "Generic OIDC", issuer: "" },
];

/** The preset whose issuer exactly matches, if any - used to highlight on load. */
function matchingPreset(issuer: string): string | null {
  const trimmed = issuer.trim();
  if (!trimmed) return null;
  return PROVIDER_PRESETS.find((p) => p.issuer !== "" && p.issuer === trimmed)?.id ?? null;
}

export interface AuthenticationFormProps {
  /** The identity model currently in effect. */
  initialMode: Mode;
  /** Prefilled OIDC issuer + client id (both non-secret). */
  issuer: string;
  clientId: string;
  /** Whether a client secret is stored (never the secret itself). */
  secretStored: boolean;
  /** Where OIDC resolves from when configured. */
  source: "db" | "env" | "none";
  /** State of HEADTOWER_SESSION_SECRET (length only, never the value). */
  sessionSecret: SessionSecretState;
  /** Whether this session may change the identity model. */
  canWrite: boolean;
}

/**
 * Editable identity model: operator (no sign-in) or OIDC single sign-on. The
 * OIDC client secret is masked - a stored secret shows only as "set" with a
 * Rotate control, and the raw value never reaches the browser. Enabling OIDC is
 * blocked in the UI (and refused by the server) until the session secret is set,
 * so no one can strand themselves.
 */
export function AuthenticationForm({
  initialMode,
  issuer: initialIssuer,
  clientId: initialClientId,
  secretStored,
  source,
  sessionSecret,
  canWrite,
}: AuthenticationFormProps) {
  const [mode, setMode] = React.useState<Mode>(initialMode);
  const [issuer, setIssuer] = React.useState(initialIssuer);
  const [issuerPreset, setIssuerPreset] = React.useState<string | null>(() =>
    matchingPreset(initialIssuer),
  );
  const [clientId, setClientId] = React.useState(initialClientId);

  const [changingSecret, setChangingSecret] = React.useState(!secretStored);
  const [clientSecret, setClientSecret] = React.useState("");
  const [reveal, setReveal] = React.useState(false);

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<Mode | null>(null);

  const secretInputOpen = changingSecret;
  const secretSatisfied = clientSecret.trim().length > 0 || secretStored;
  const sessionSecretOk = sessionSecret.status === "ok";
  const issuerHint = PROVIDER_PRESETS.find((p) => p.id === issuerPreset)?.hint;

  function selectPreset(preset: ProviderPreset) {
    setIssuer(preset.issuer);
    setIssuerPreset(preset.id);
    reset();
  }

  const oidcComplete =
    issuer.trim().length > 0 && clientId.trim().length > 0 && secretSatisfied;
  const canSave =
    canWrite &&
    (mode === "operator" || (oidcComplete && sessionSecretOk));

  function reset() {
    setError(null);
    setSaved(null);
  }

  async function onSave() {
    setSaving(true);
    reset();
    const payload: SaveAuthInput =
      mode === "operator"
        ? { mode: "operator" }
        : {
            mode: "oidc",
            issuer: issuer.trim(),
            clientId: clientId.trim(),
            clientSecret: clientSecret.trim(),
          };
    try {
      const result = await saveAuthentication(payload);
      if (result.status === "success") {
        setSaved(result.mode);
        if (result.mode === "oidc") {
          setClientSecret("");
          setReveal(false);
          setChangingSecret(false); // A secret is now stored; collapse back to "set".
        }
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
          onSelect={() => {
            setMode("operator");
            reset();
          }}
          icon={KeyRound}
          title="Operator mode"
          description="No sign-in. Anyone who can reach the console controls the tailnet, with the default role."
        />
        <ChoiceCard
          selected={mode === "oidc"}
          disabled={!canWrite}
          onSelect={() => {
            setMode("oidc");
            reset();
          }}
          icon={ShieldCheck}
          title="Single sign-on (OIDC)"
          description="Operators sign in through an identity provider. Per-account roles and a full audit trail."
        />
      </div>

      {mode === "oidc" && (
        <div className="flex flex-col gap-4 rounded-control border border-line bg-surface-2 p-4">
          {source === "env" && (
            <p className="flex items-start gap-2 text-xs text-ink-faint">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Some values are inherited from HEADTOWER_OIDC_* environment
              variables. Saving here writes an override to the database.
            </p>
          )}

          <Field label="Identity provider">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Identity provider preset">
              {PROVIDER_PRESETS.map((preset) => {
                const isActive = issuerPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={!canWrite}
                    aria-pressed={isActive}
                    onClick={() => selectPreset(preset)}
                    className={cn(
                      "rounded-control border px-2.5 py-1 text-xs font-medium transition-colors",
                      "disabled:pointer-events-none disabled:opacity-50",
                      isActive
                        ? "border-beacon-500 bg-beacon-500/10 text-beacon-500"
                        : "border-line-strong bg-surface text-ink-muted hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Issuer URL" htmlFor="oidc-issuer" description={issuerHint}>
            <Input
              id="oidc-issuer"
              mono
              value={issuer}
              spellCheck={false}
              autoComplete="off"
              disabled={!canWrite}
              placeholder="https://id.example.com"
              onChange={(e) => {
                setIssuer(e.target.value);
                setIssuerPreset(matchingPreset(e.target.value));
                reset();
              }}
            />
          </Field>

          <Field label="Client ID" htmlFor="oidc-cid">
            <Input
              id="oidc-cid"
              mono
              value={clientId}
              spellCheck={false}
              autoComplete="off"
              disabled={!canWrite}
              placeholder="headtower"
              onChange={(e) => {
                setClientId(e.target.value);
                reset();
              }}
            />
          </Field>

          <Field
            label="Client secret"
            htmlFor="oidc-secret"
            description={
              secretInputOpen
                ? "Stored encrypted when HEADTOWER_SECRET is set."
                : undefined
            }
          >
            {secretInputOpen ? (
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <Input
                    id="oidc-secret"
                    mono
                    type={reveal ? "text" : "password"}
                    value={clientSecret}
                    spellCheck={false}
                    autoComplete="off"
                    disabled={!canWrite}
                    placeholder={secretStored ? "Paste a new secret" : "Client secret"}
                    className="pr-10"
                    onChange={(e) => {
                      setClientSecret(e.target.value);
                      reset();
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setReveal((v) => !v)}
                    aria-label={reveal ? "Hide client secret" : "Show client secret"}
                    className="absolute right-2 top-1/2 flex -translate-y-1/2 text-ink-faint transition-colors hover:text-ink"
                  >
                    {reveal ? (
                      <EyeOff className="h-4 w-4" aria-hidden />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                </div>
                {secretStored && canWrite && (
                  <button
                    type="button"
                    onClick={() => {
                      setChangingSecret(false);
                      setClientSecret("");
                      setReveal(false);
                      reset();
                    }}
                    className="inline-flex w-fit items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-ink"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                    Cancel
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-control border border-line-strong bg-surface px-3 py-2">
                <div className="flex items-center gap-2">
                  <StatusDot status="online" />
                  <span className="text-sm text-ink">A secret is stored</span>
                  <Chip variant="default" mono>
                    {source === "env" ? "from env" : "in db"}
                  </Chip>
                </div>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => {
                      setChangingSecret(true);
                      reset();
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

          <SessionSecretNote state={sessionSecret} />
        </div>
      )}

      {mode === "operator" && initialMode === "oidc" && (
        <p className="flex items-start gap-2 rounded-control border border-warn-500/40 bg-warn-500/10 px-3 py-2.5 text-xs text-warn-500">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Saving switches off single sign-on. Existing sessions end and the
          console becomes reachable without signing in.
        </p>
      )}

      {saved && (
        <p className="flex items-start gap-2 rounded-control border border-online-600/40 bg-online-500/10 px-3 py-2.5 text-xs text-ink">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-online-500" aria-hidden />
          {saved === "oidc"
            ? "Single sign-on saved. New sign-ins go through your provider."
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
              "Save operator mode"
            ) : (
              "Save single sign-on"
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
          chars). This is separate from the client secret above - it signs the
          login cookie and is read from the HEADTOWER_SESSION_SECRET
          environment variable. To change it, update that variable in your
          environment and redeploy (which signs everyone out).
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
        OIDC sign-in signs its cookie with it. Set it to 32+ characters of
        randomness in the environment, then enable single sign-on.
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
