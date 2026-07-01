"use client";

import * as React from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  RotateCw,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field, Input } from "@/components/ui/field";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/cn";
import { saveConnection, testConnection } from "./actions";

type TestResult = Awaited<ReturnType<typeof testConnection>>;

/** Whether the stored key is usable, unreadable (secret rotated), or absent. */
export type KeyStatus = "set" | "unreadable" | "unset";

export interface ConnectionFormProps {
  /** Current Headscale base URL, if any. */
  initialUrl: string;
  /** Public login-server URL for device enrolment (blank = reuse the base URL). */
  initialLoginServerUrl: string;
  /** State of the stored API key (never the key itself). */
  keyStatus: KeyStatus;
  /** Where the live connection resolves from: the DB store or the env bootstrap. */
  source: "db" | "env" | "none";
  /** Whether this session may edit the connection. */
  canWrite: boolean;
}

/**
 * Editable Headscale connection. The URL is a plain field; the API key is
 * masked - a stored key shows only as "set" with a Rotate control that reveals a
 * fresh input, and the raw secret is never sent to the browser. A live Test
 * button probes the control plane (using the stored key when no new one is
 * typed) before anything is saved.
 */
export function ConnectionForm({
  initialUrl,
  initialLoginServerUrl,
  keyStatus,
  source,
  canWrite,
}: ConnectionFormProps) {
  const hasStoredKey = keyStatus === "set";

  const [url, setUrl] = React.useState(initialUrl);
  const [loginServerUrl, setLoginServerUrl] = React.useState(initialLoginServerUrl);
  // When there is no usable stored key the input is always open; otherwise the
  // operator opts in to rotating via the Rotate control.
  const [rotating, setRotating] = React.useState(!hasStoredKey);
  const [apiKey, setApiKey] = React.useState("");
  const [reveal, setReveal] = React.useState(false);

  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<TestResult | null>(null);

  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<null | { rotated: boolean }>(null);

  const keyInputOpen = rotating;
  const keyProvided = apiKey.trim().length > 0;
  // The key requirement is met by either a freshly typed key or a usable stored
  // one. An "unreadable" stored key can't be reused, so a new one is required.
  const keySatisfied = keyProvided || hasStoredKey;
  const urlProvided = url.trim().length > 0;

  /** Any edit to the inputs invalidates the last probe and success banner. */
  function invalidate() {
    setTestResult(null);
    setSaved(null);
  }

  async function onTest() {
    setTesting(true);
    setSaved(null);
    try {
      setTestResult(await testConnection({ url: url.trim(), apiKey: apiKey.trim() }));
    } catch {
      setTestResult({
        ok: false,
        status: "error",
        message: "The test couldn't be run. Try again.",
      });
    } finally {
      setTesting(false);
    }
  }

  async function onSave() {
    setSaving(true);
    setSaveError(null);
    setSaved(null);
    try {
      const result = await saveConnection({
        url: url.trim(),
        apiKey: apiKey.trim(),
        loginServerUrl: loginServerUrl.trim(),
      });
      if (result.status === "success") {
        setSaved({ rotated: result.rotated });
        setApiKey("");
        setReveal(false);
        setRotating(false); // A key is now stored; collapse back to "set".
        setTestResult(null);
      } else {
        setSaveError(result.error);
      }
    } catch {
      setSaveError("The connection couldn't be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {!canWrite && (
        <p className="flex items-start gap-2 rounded-control border border-line bg-surface-2 px-3 py-2.5 text-xs text-ink-muted">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
          You can view the connection but not change it. This needs the{" "}
          <span className="data text-ink">settings.write</span> capability.
        </p>
      )}

      <Field
        label="Headscale URL"
        htmlFor="hs-url"
        description="The base URL of your Headscale control plane."
      >
        <Input
          id="hs-url"
          mono
          value={url}
          spellCheck={false}
          autoComplete="off"
          disabled={!canWrite}
          placeholder="https://headscale.example.com"
          onChange={(e) => {
            setUrl(e.target.value);
            invalidate();
          }}
        />
      </Field>

      <Field
        label="API key"
        htmlFor="hs-key"
        description={
          keyInputOpen
            ? "Create one with `headscale apikeys create`. Stored encrypted when HEADTOWER_SECRET is set."
            : undefined
        }
      >
        {keyInputOpen ? (
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Input
                id="hs-key"
                mono
                type={reveal ? "text" : "password"}
                value={apiKey}
                spellCheck={false}
                autoComplete="off"
                disabled={!canWrite}
                placeholder={hasStoredKey ? "Paste a new key to rotate" : "Paste the API key"}
                className="pr-10"
                onChange={(e) => {
                  setApiKey(e.target.value);
                  invalidate();
                }}
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? "Hide API key" : "Show API key"}
                className="absolute right-2 top-1/2 flex -translate-y-1/2 text-ink-faint transition-colors hover:text-ink"
              >
                {reveal ? (
                  <EyeOff className="h-4 w-4" aria-hidden />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden />
                )}
              </button>
            </div>
            {hasStoredKey && canWrite && (
              <button
                type="button"
                onClick={() => {
                  setRotating(false);
                  setApiKey("");
                  setReveal(false);
                  invalidate();
                }}
                className="inline-flex w-fit items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-ink"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Keep the current key
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-control border border-line-strong bg-surface-2 px-3 py-2">
            <div className="flex items-center gap-2">
              <StatusDot status="online" />
              <span className="text-sm text-ink">A key is stored</span>
              <Chip variant="default" mono>
                {source === "env" ? "from env" : "in db"}
              </Chip>
            </div>
            {canWrite && (
              <button
                type="button"
                onClick={() => {
                  setRotating(true);
                  invalidate();
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-beacon-500 transition-colors hover:text-beacon-400"
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden />
                Rotate key
              </button>
            )}
          </div>
        )}
      </Field>

      <Field
        label="Login server URL"
        htmlFor="hs-login-url"
        description="The public URL devices enrol against (tailscale up --login-server). Leave blank to reuse the Headscale URL above."
      >
        <Input
          id="hs-login-url"
          mono
          value={loginServerUrl}
          spellCheck={false}
          autoComplete="off"
          disabled={!canWrite}
          placeholder="https://hs.example.com"
          onChange={(e) => {
            setLoginServerUrl(e.target.value);
            invalidate();
          }}
        />
      </Field>

      {keyStatus === "unreadable" && (
        <p className="flex items-start gap-2 rounded-control border border-warn-500/40 bg-warn-500/10 px-3 py-2.5 text-xs text-warn-500">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          A key is stored but can&apos;t be decrypted - HEADTOWER_SECRET was
          changed or removed. Paste the key again to restore access.
        </p>
      )}

      {testResult && <TestBanner result={testResult} />}

      {saved && (
        <p className="flex items-start gap-2 rounded-control border border-online-600/40 bg-online-500/10 px-3 py-2.5 text-xs text-ink">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-online-500" aria-hidden />
          Connection saved.{saved.rotated ? " The API key was rotated." : ""} It
          takes effect immediately - no restart needed.
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
        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <Button
            variant="outline"
            onClick={onTest}
            disabled={testing || saving || !urlProvided || !keySatisfied}
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
            onClick={onSave}
            disabled={saving || testing || !urlProvided || !keySatisfied}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Saving...
              </>
            ) : (
              "Save connection"
            )}
          </Button>
        </div>
      )}
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
