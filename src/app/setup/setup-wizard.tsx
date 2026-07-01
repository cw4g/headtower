"use client";

import * as React from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  PlugZap,
  ShieldCheck,
  TowerControl,
  type LucideIcon,
} from "lucide-react";
import { BeaconMark } from "@/components/beacon-mark";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/cn";
import {
  completeSetupAction,
  testConnectionAction,
  type CompleteSetupInput,
} from "./actions";

type TestResult = Awaited<ReturnType<typeof testConnectionAction>>;
type Identity = "operator" | "oidc";

const STEP_LABELS = ["Connect", "Identity", "Finish"] as const;

export interface SetupWizardProps {
  /** Prefilled Headscale URL from an env bootstrap, if any. */
  initialUrl: string;
  /** Whether HEADTOWER_SECRET is set (secrets encrypted at rest). */
  encryptsSecrets: boolean;
}

/**
 * The first-run wizard: connect to Headscale, choose how operators sign in, then
 * persist it all in one atomic write. On-brand schematic console styling; the
 * live connection Test is the load-bearing interaction of step one.
 */
export function SetupWizard({ initialUrl, encryptsSecrets }: SetupWizardProps) {
  const [step, setStep] = React.useState(0);

  // Step 1 - Connect
  const [url, setUrl] = React.useState(initialUrl);
  const [apiKey, setApiKey] = React.useState("");
  const [revealKey, setRevealKey] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<TestResult | null>(null);

  // Step 2 - Identity
  const [identity, setIdentity] = React.useState<Identity>("operator");
  const [issuer, setIssuer] = React.useState("");
  const [clientId, setClientId] = React.useState("");
  const [clientSecret, setClientSecret] = React.useState("");

  // Step 3 - Finish
  const [finishing, setFinishing] = React.useState(false);
  const [finishError, setFinishError] = React.useState<string | null>(null);

  const connectionVerified = testResult?.ok === true;
  const oidcComplete = Boolean(
    issuer.trim() && clientId.trim() && clientSecret.trim(),
  );
  const canContinueIdentity = identity === "operator" || oidcComplete;

  /** Any edit to the credentials invalidates the last probe. */
  function resetTest() {
    setTestResult(null);
  }

  async function onTest() {
    setTesting(true);
    try {
      setTestResult(
        await testConnectionAction({ url: url.trim(), apiKey: apiKey.trim() }),
      );
    } catch {
      setTestResult({
        ok: false,
        status: "error",
        message: "The test could not be run. Try again.",
      });
    } finally {
      setTesting(false);
    }
  }

  async function onFinish() {
    setFinishError(null);
    setFinishing(true);
    const payload: CompleteSetupInput = {
      headscale: { url: url.trim(), apiKey: apiKey.trim() },
      oidc:
        identity === "oidc"
          ? {
              issuer: issuer.trim(),
              clientId: clientId.trim(),
              clientSecret: clientSecret.trim(),
            }
          : null,
    };
    try {
      // Resolves (with an error) only on failure; success redirects us away.
      const result = await completeSetupAction(payload);
      if (result && !result.ok) {
        setFinishError(result.error);
        setFinishing(false);
      }
    } catch {
      setFinishError("Setup could not be saved. Try again.");
      setFinishing(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="grid-field pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative w-full max-w-xl">
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-xl shadow-graphite-950/20">
          {/* Brand header */}
          <div className="flex items-center gap-3 border-b border-line px-6 py-5">
            <BeaconMark className="h-10 w-10 shrink-0" />
            <div className="flex flex-col">
              <h1 className="text-base font-semibold tracking-tight text-ink">
                head<span className="text-ink-muted">tower</span> setup
              </h1>
              <p className="text-xs text-ink-muted">
                Configure the console here. No env files required.
              </p>
            </div>
          </div>

          <Stepper current={step} />

          <div className="px-6 py-6">
            {step === 0 && (
              <div className="flex flex-col gap-5">
                <StepIntro
                  icon={PlugZap}
                  eyebrow="Step 01 · Connect"
                  title="Connect to Headscale"
                  description="Point Headtower at your control plane, then verify the API key with a live test."
                />

                <Field
                  label="Headscale URL"
                  htmlFor="hs-url"
                  description="The base URL of your Headscale server."
                >
                  <Input
                    id="hs-url"
                    mono
                    value={url}
                    autoFocus
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="https://headscale.example.com"
                    onChange={(e) => {
                      setUrl(e.target.value);
                      resetTest();
                    }}
                  />
                </Field>

                <Field
                  label="API key"
                  htmlFor="hs-key"
                  description="Create one with `headscale apikeys create`."
                >
                  <div className="relative">
                    <Input
                      id="hs-key"
                      mono
                      type={revealKey ? "text" : "password"}
                      value={apiKey}
                      spellCheck={false}
                      autoComplete="off"
                      placeholder="Paste the API key"
                      className="pr-10"
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        resetTest();
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setRevealKey((v) => !v)}
                      aria-label={revealKey ? "Hide API key" : "Show API key"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 flex text-ink-faint transition-colors hover:text-ink"
                    >
                      {revealKey ? (
                        <EyeOff className="h-4 w-4" aria-hidden />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                  </div>
                </Field>

                {testResult && <TestBanner result={testResult} />}

                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="outline"
                    onClick={onTest}
                    disabled={testing || !url.trim() || !apiKey.trim()}
                  >
                    {testing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Testing...
                      </>
                    ) : (
                      "Test connection"
                    )}
                  </Button>
                  <Button
                    variant="solid"
                    onClick={() => setStep(1)}
                    disabled={!connectionVerified}
                  >
                    Continue
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="flex flex-col gap-5">
                <StepIntro
                  icon={ShieldCheck}
                  eyebrow="Step 02 · Identity"
                  title="Who can sign in"
                  description="Choose how operators authenticate. This can be changed later."
                />

                <div className="grid gap-3">
                  <ChoiceCard
                    selected={identity === "operator"}
                    onSelect={() => setIdentity("operator")}
                    icon={KeyRound}
                    title="Operator mode"
                    description="Single operator, no sign-in. Anyone who can reach the console controls the tailnet."
                  />
                  <ChoiceCard
                    selected={identity === "oidc"}
                    onSelect={() => setIdentity("oidc")}
                    icon={ShieldCheck}
                    title="Single sign-on (OIDC)"
                    description="Sign in with an identity provider. Per-account roles and an audit trail."
                  />
                </div>

                {identity === "oidc" && (
                  <div className="flex flex-col gap-4 rounded-control border border-line bg-surface-2 p-4">
                    <Field label="Issuer URL" htmlFor="oidc-issuer">
                      <Input
                        id="oidc-issuer"
                        mono
                        value={issuer}
                        spellCheck={false}
                        autoComplete="off"
                        placeholder="https://id.example.com"
                        onChange={(e) => setIssuer(e.target.value)}
                      />
                    </Field>
                    <Field label="Client ID" htmlFor="oidc-cid">
                      <Input
                        id="oidc-cid"
                        mono
                        value={clientId}
                        spellCheck={false}
                        autoComplete="off"
                        placeholder="headtower"
                        onChange={(e) => setClientId(e.target.value)}
                      />
                    </Field>
                    <Field label="Client secret" htmlFor="oidc-secret">
                      <Input
                        id="oidc-secret"
                        mono
                        type="password"
                        value={clientSecret}
                        spellCheck={false}
                        autoComplete="off"
                        placeholder="Client secret"
                        onChange={(e) => setClientSecret(e.target.value)}
                      />
                    </Field>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <Button variant="ghost" onClick={() => setStep(0)}>
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                    Back
                  </Button>
                  <Button
                    variant="solid"
                    onClick={() => setStep(2)}
                    disabled={!canContinueIdentity}
                  >
                    Continue
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-5">
                <StepIntro
                  icon={TowerControl}
                  eyebrow="Step 03 · Finish"
                  title="Review and start"
                  description="Confirm the configuration. Headtower writes it to its local database."
                />

                <dl className="overflow-hidden rounded-control border border-line">
                  <SummaryRow label="Control plane" value={hostLabel(url)} />
                  <SummaryRow
                    label="API key"
                    value={apiKey ? maskKey(apiKey) : "Not set"}
                  />
                  <SummaryRow
                    label="Identity"
                    value={
                      identity === "oidc"
                        ? `SSO · ${hostLabel(issuer)}`
                        : "Operator mode"
                    }
                  />
                  <SummaryRow
                    label="Secrets at rest"
                    value={
                      encryptsSecrets
                        ? "Encrypted (AES-256-GCM)"
                        : "Plaintext · set HEADTOWER_SECRET to encrypt"
                    }
                  />
                </dl>

                {finishError && (
                  <p
                    role="alert"
                    className="rounded-control border border-critical-500/40 bg-critical-500/10 px-3 py-2 text-xs text-critical-500"
                  >
                    {finishError}
                  </p>
                )}

                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => setStep(1)}
                    disabled={finishing}
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                    Back
                  </Button>
                  <Button variant="solid" onClick={onFinish} disabled={finishing}>
                    {finishing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Saving...
                      </>
                    ) : (
                      <>
                        Finish setup
                        <Check className="h-4 w-4" aria-hidden />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-ink-faint">
          Stored in Headtower&apos;s local database, overriding any env bootstrap.
        </p>
      </div>
    </main>
  );
}

/** The three-segment progress rail across the top of the wizard body. */
function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-stretch border-b border-line">
      {STEP_LABELS.map((label, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        return (
          <li
            key={label}
            className={cn(
              "flex flex-1 items-center gap-2 px-4 py-3",
              i > 0 && "border-l border-line",
            )}
          >
            <span
              className={cn(
                "data flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium",
                state === "active" &&
                  "border-beacon-500 bg-beacon-500 text-graphite-950",
                state === "done" &&
                  "border-online-600 bg-online-500/15 text-online-500",
                state === "todo" && "border-line-strong text-ink-faint",
              )}
            >
              {state === "done" ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : (
                String(i + 1).padStart(2, "0")
              )}
            </span>
            <span
              className={cn(
                "text-xs font-medium",
                state === "todo" ? "text-ink-faint" : "text-ink",
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StepIntro({
  icon: Icon,
  eyebrow,
  title,
  description,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="data text-[11px] uppercase tracking-[0.12em] text-beacon-500">
        {eyebrow}
      </span>
      <div className="flex items-center gap-2.5">
        <Icon className="h-5 w-5 text-ink-muted" aria-hidden />
        <h2 className="text-base font-semibold text-ink">{title}</h2>
      </div>
      <p className="text-sm text-ink-muted">{description}</p>
    </div>
  );
}

function TestBanner({ result }: { result: TestResult }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-control border px-3 py-2.5",
        result.ok
          ? "border-online-600/40 bg-online-500/10"
          : "border-critical-500/40 bg-critical-500/10",
      )}
    >
      <StatusDot status={result.ok ? "online" : "critical"} className="mt-0.5" />
      <span className="text-xs leading-relaxed text-ink">{result.message}</span>
    </div>
  );
}

function ChoiceCard({
  selected,
  onSelect,
  icon: Icon,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex items-start gap-3 rounded-control border px-4 py-3 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40",
        selected
          ? "border-beacon-500 bg-beacon-500/5"
          : "border-line-strong bg-surface hover:bg-surface-2",
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
          selected
            ? "border-beacon-500 bg-beacon-500 text-graphite-950"
            : "border-line-strong",
        )}
      >
        {selected && <Check className="h-3 w-3" aria-hidden />}
      </span>
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-3.5 py-2.5 last:border-b-0">
      <dt className="text-[11px] uppercase tracking-[0.08em] text-ink-faint">
        {label}
      </dt>
      <dd className="data break-all text-right text-sm text-ink">{value}</dd>
    </div>
  );
}

/** Host of a URL for display; falls back to the raw string. */
function hostLabel(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "Not set";
  try {
    return new URL(trimmed).host;
  } catch {
    return trimmed;
  }
}

/** Show only enough of the key to recognise it; never the full secret. */
function maskKey(key: string): string {
  const head = key.slice(0, 6);
  return key.length > 6 ? `${head}...` : "Set";
}
