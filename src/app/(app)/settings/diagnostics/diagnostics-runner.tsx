"use client";

import { useSyncExternalStore, useTransition } from "react";
import {
  CheckCircle2,
  CircleDashed,
  Play,
  RotateCw,
  Stethoscope,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import {
  runDiagnostics,
  type CheckStatus,
  type DiagnosticCheck,
  type DiagnosticsReport,
} from "./actions";

// Per-session persistence: the last run survives navigation within the tab but
// is not a server global and does not leak across sessions. `sessionStorage` is
// the single source of truth, read through `useSyncExternalStore` so the first
// client render hydrates the stored run without a mismatch warning.
const STORAGE_KEY = "headtower:diagnostics:last-run";
const STORE_EVENT = "headtower:diagnostics:update";

// Authoritative in-memory snapshot for this tab. Lazily hydrated from
// sessionStorage on first read (so a full reload restores the last run) and a
// stable object reference between writes, as useSyncExternalStore requires.
let liveReport: DiagnosticsReport | null = null;
let hydrated = false;

function readReport(): DiagnosticsReport | null {
  if (!hydrated) {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      liveReport = raw ? (JSON.parse(raw) as DiagnosticsReport) : null;
    } catch {
      liveReport = null;
    }
    hydrated = true;
  }
  return liveReport;
}

function writeReport(report: DiagnosticsReport): void {
  liveReport = report;
  hydrated = true;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(report));
  } catch {
    // Storage unavailable (private mode / quota): the in-memory value still
    // drives the UI for the rest of this session.
  }
  window.dispatchEvent(new Event(STORE_EVENT));
}

function subscribeReport(onChange: () => void): () => void {
  window.addEventListener(STORE_EVENT, onChange);
  return () => window.removeEventListener(STORE_EVENT, onChange);
}

const statusIcon: Record<CheckStatus, LucideIcon> = {
  pass: CheckCircle2,
  fail: XCircle,
  skip: CircleDashed,
};

const statusTone: Record<CheckStatus, string> = {
  pass: "text-online-500",
  fail: "text-critical-500",
  skip: "text-ink-faint",
};

const statusLabel: Record<CheckStatus, string> = {
  pass: "Pass",
  fail: "Fail",
  skip: "Skipped",
};

/**
 * On-demand connection self-check. Runs the `runDiagnostics` Server Action,
 * renders pass/fail/skip rows with hints, and remembers the last run for the
 * session via `sessionStorage`, read through `useSyncExternalStore` so it
 * hydrates cleanly. State lives in the tab, never on the server.
 */
export function DiagnosticsRunner() {
  const report = useSyncExternalStore(
    subscribeReport,
    readReport,
    () => null, // Server snapshot: no persisted run exists during SSR.
  );
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const next = await runDiagnostics();
      writeReport(next);
    });
  }

  const summary = report ? summarize(report.checks) : null;

  return (
    <div className="flex flex-col gap-4">
      <Card className="grid-field">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card border border-line bg-surface text-ink-muted">
              <Stethoscope className="h-5 w-5" aria-hidden />
            </span>
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium text-ink">Connection self-check</p>
              <p className="max-w-md text-xs text-ink-muted">
                Probe the control plane for reachability, API version, and key
                authorization. Runs only when you ask it to.
              </p>
            </div>
          </div>
          <Button variant="solid" onClick={run} disabled={pending} className="shrink-0">
            {pending ? (
              <>
                <RotateCw className="h-4 w-4 animate-spin" aria-hidden />
                Running…
              </>
            ) : report ? (
              <>
                <RotateCw className="h-4 w-4" aria-hidden />
                Run again
              </>
            ) : (
              <>
                <Play className="h-4 w-4" aria-hidden />
                Run self-check
              </>
            )}
          </Button>
        </div>
      </Card>

      {report && summary && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <OverallDot status={summary.overall} />
              <span className="text-sm font-medium text-ink">{summary.headline}</span>
            </div>
            <span className="data text-xs text-ink-faint" title={report.ranAt}>
              {report.target ? `${report.target} · ` : ""}
              {formatRan(report.ranAt)}
            </span>
          </div>
          <ul>
            {report.checks.map((check) => (
              <CheckRow key={check.id} check={check} />
            ))}
          </ul>
        </Card>
      )}

      {!report && (
        <p className="px-1 text-xs text-ink-faint">
          No self-check has run this session yet.
        </p>
      )}
    </div>
  );
}

function CheckRow({ check }: { check: DiagnosticCheck }) {
  const Icon = statusIcon[check.status];
  return (
    <li className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-0">
      <Icon
        className={cn("mt-0.5 h-4 w-4 shrink-0", statusTone[check.status])}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink">{check.label}</span>
          <span className={cn("data text-[11px] uppercase tracking-[0.08em]", statusTone[check.status])}>
            {statusLabel[check.status]}
          </span>
        </div>
        <p className="text-xs text-ink-muted">{check.detail}</p>
        {check.hint && check.status !== "pass" && (
          <p className="text-xs text-ink-faint">{check.hint}</p>
        )}
      </div>
    </li>
  );
}

type Overall = "pass" | "fail" | "partial";

function OverallDot({ status }: { status: Overall }) {
  const tone =
    status === "pass"
      ? "bg-online-500"
      : status === "fail"
        ? "bg-critical-500"
        : "bg-warn-500";
  return <span className={cn("h-2 w-2 shrink-0 rounded-full", tone)} aria-hidden />;
}

function summarize(checks: DiagnosticCheck[]): { overall: Overall; headline: string } {
  const failed = checks.filter((c) => c.status === "fail").length;
  const passed = checks.filter((c) => c.status === "pass").length;
  if (failed === 0) return { overall: "pass", headline: "All checks passed" };
  if (passed === 0) return { overall: "fail", headline: "Control plane unreachable" };
  return {
    overall: "partial",
    headline: `${failed} ${failed === 1 ? "check" : "checks"} failed`,
  };
}

/** Render the run time as a compact local timestamp. */
function formatRan(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
