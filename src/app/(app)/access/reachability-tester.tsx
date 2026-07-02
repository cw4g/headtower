"use client";

import * as React from "react";
import {
  ArrowRight,
  Ban,
  Info,
  Play,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field, Input, Select } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import type { EvalResult } from "@/lib/policy";
import {
  testReachability,
  type ReachabilityDelta,
  type ReachabilityState,
} from "./actions";

interface ReachabilityTesterProps {
  savedDocument: string;
  editedDocument: string;
  dirty: boolean;
  /** Vocabulary tokens for the source/destination autocompletes. */
  suggestions: string[];
}

/**
 * The Test tab: pose a source -> destination[:port] question and get an
 * ALLOW/DENY verdict evaluated server-side against the policy. When the editor
 * is dirty, both the saved and the edited policy are evaluated and the delta is
 * surfaced explicitly ("this unsaved edit would NEWLY ALLOW/DENY this traffic").
 */
export function ReachabilityTester({
  savedDocument,
  editedDocument,
  dirty,
  suggestions,
}: ReachabilityTesterProps) {
  const [src, setSrc] = React.useState("");
  const [dst, setDst] = React.useState("");
  const [port, setPort] = React.useState("");
  const [protocol, setProtocol] = React.useState("any");
  const [result, setResult] = React.useState<ReachabilityState | null>(null);
  const [pending, startTransition] = React.useTransition();

  const listId = React.useId();
  const canRun = src.trim() !== "" && dst.trim() !== "" && !pending;

  function run() {
    if (!canRun) return;
    startTransition(async () => {
      const res = await testReachability({
        savedDocument,
        editedDocument,
        src: src.trim(),
        dst: dst.trim(),
        port,
        protocol,
      });
      setResult(res);
    });
  }

  function onFormKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      run();
    }
  }

  return (
    <div className="space-y-5">
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <div
        onKeyDown={onFormKeyDown}
        className="rounded-card border border-line bg-surface p-4"
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <Field label="Source" description="A user, group:, tag:, host, or CIDR.">
            <Input
              mono
              list={listId}
              value={src}
              onChange={(e) => setSrc(e.target.value)}
              placeholder="group:eng"
              aria-label="Source selector"
            />
          </Field>
          <div className="hidden items-end justify-center pb-2.5 sm:flex">
            <ArrowRight className="h-4 w-4 text-ink-faint" aria-hidden />
          </div>
          <Field label="Destination" description="Where the traffic is headed.">
            <Input
              mono
              list={listId}
              value={dst}
              onChange={(e) => setDst(e.target.value)}
              placeholder="tag:prod"
              aria-label="Destination selector"
            />
          </Field>
        </div>
        <div className="mt-3 grid items-end gap-3 sm:grid-cols-[8rem_10rem_1fr]">
          <Field label="Port" description="Optional.">
            <Input
              mono
              inputMode="numeric"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="22"
              aria-label="Destination port"
            />
          </Field>
          <Field label="Protocol">
            <Select
              value={protocol}
              onChange={(e) => setProtocol(e.target.value)}
              aria-label="Protocol"
            >
              <option value="any">any</option>
              <option value="tcp">tcp</option>
              <option value="udp">udp</option>
              <option value="icmp">icmp</option>
            </Select>
          </Field>
          <div className="flex justify-end">
            <Button variant="solid" onClick={run} disabled={!canRun}>
              <Play className="h-3.5 w-3.5" aria-hidden />
              {pending ? "Evaluating…" : "Evaluate"}
            </Button>
          </div>
        </div>
      </div>

      {result?.status === "error" && (
        <p
          role="alert"
          className="flex items-center gap-1.5 text-xs text-critical-500"
        >
          <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
          {result.error}
        </p>
      )}

      {/* The verdict is a live region so a screen reader announces each new
          ALLOW/DENY result (and the unsaved-edit delta) as it lands. */}
      {result?.status === "success" && result.saved && (
        <div role="status" aria-live="polite">
          <ResultBlock
            dirty={dirty && result.edited != null}
            saved={result.saved}
            edited={result.edited ?? null}
            delta={result.delta ?? "same"}
          />
        </div>
      )}
    </div>
  );
}

function ResultBlock({
  dirty,
  saved,
  edited,
  delta,
}: {
  dirty: boolean;
  saved: EvalResult;
  edited: EvalResult | null;
  delta: ReachabilityDelta;
}) {
  return (
    <div className="space-y-4">
      {dirty && delta !== "same" && <DeltaBanner delta={delta} />}

      {dirty && edited ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <VerdictCard title="Saved policy" result={saved} />
          <VerdictCard title="Edited policy" result={edited} highlight={delta !== "same"} />
        </div>
      ) : (
        <VerdictCard title="Verdict" result={saved} />
      )}
    </div>
  );
}

function DeltaBanner({ delta }: { delta: ReachabilityDelta }) {
  const allow = delta === "newly-allow";
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-card border px-3 py-2 text-xs font-medium",
        allow
          ? "border-online-500/30 bg-online-500/10 text-online-500"
          : "border-critical-500/30 bg-critical-500/10 text-critical-500",
      )}
    >
      <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
      This unsaved edit would newly {allow ? "ALLOW" : "DENY"} this traffic.
    </div>
  );
}

function VerdictCard({
  title,
  result,
  highlight,
}: {
  title: string;
  result: EvalResult;
  highlight?: boolean;
}) {
  const allow = result.decision === "allow";
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-card border bg-surface p-4",
        highlight ? "border-beacon-500/40" : "border-line",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">
          {title}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold",
            allow
              ? "border-online-500/30 bg-online-500/10 text-online-500"
              : "border-critical-500/30 bg-critical-500/10 text-critical-500",
          )}
        >
          {allow ? (
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Ban className="h-3.5 w-3.5" aria-hidden />
          )}
          {allow ? "ALLOW" : "DENY"}
        </span>
      </div>

      {result.match ? (
        <div className="flex flex-col gap-1.5 text-[11px]">
          <span className="text-ink-faint">
            Matched by{" "}
            <span className="data text-ink-muted">
              acls[{result.match.ruleIndex}]
            </span>
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip mono variant="default">
              {result.match.matchedSrc}
            </Chip>
            <ArrowRight className="h-3 w-3 text-ink-faint" aria-hidden />
            <Chip mono variant="default">
              {result.match.matchedDst}
            </Chip>
          </div>
        </div>
      ) : (
        <span className="text-[11px] text-ink-faint">
          No rule permits this traffic - default deny.
        </span>
      )}

      {result.notes.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-line/60 pt-2">
          {result.notes.map((note) => (
            <li
              key={note}
              className="flex items-start gap-1.5 text-[11px] text-ink-faint"
            >
              <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
