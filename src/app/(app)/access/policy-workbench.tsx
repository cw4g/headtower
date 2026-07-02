"use client";

import * as React from "react";
import {
  Braces,
  CircleCheck,
  CircleSlash,
  LayoutPanelLeft,
  Minus,
  Save,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { SegmentedTabs, type SegmentedOption } from "@/components/ui/segmented";
import {
  parsePolicy,
  serializePolicy,
  validateHujson,
  type PolicyModel,
  type Validity,
} from "@/lib/policy";
import { savePolicy } from "./actions";
import { JsonEditor } from "./json-editor";
import { VisualEditor } from "./visual-editor";

interface PolicyWorkbenchProps {
  /** The HuJSON document read from the control plane (may be empty/unset). */
  initialDocument: string;
  /** When the stored policy was last updated; null if never set. */
  initialUpdatedAt: string | null;
  /** True when the read returned no document yet - first authoring. */
  unset?: boolean;
  /** When false (role lacks acls.write), the editor is view-only: Save is off. */
  canSave?: boolean;
}

type Tab = "visual" | "json";

const PARSE_FALLBACK = "This document isn't valid HuJSON yet.";

const TAB_OPTIONS: SegmentedOption<Tab>[] = [
  { value: "visual", label: "Visual", icon: LayoutPanelLeft },
  { value: "json", label: "JSON", icon: Braces },
];

/**
 * The Access workbench: a schematic console hosting two synced views of one
 * policy document. The Visual tab is a sectioned rule builder; the JSON tab is
 * the raw HuJSON surface. Edits in either view flow through a single document
 * string, so switching tabs always reflects the latest state. A single beacon
 * Save action commits to the control plane (Cmd-S from anywhere); Headscale is
 * the authoritative validator.
 */
export function PolicyWorkbench({
  initialDocument,
  initialUpdatedAt,
  unset = false,
  canSave: writable = true,
}: PolicyWorkbenchProps) {
  const initial = React.useMemo(
    () => parsePolicy(initialDocument),
    [initialDocument],
  );

  const [value, setValue] = React.useState(initialDocument);
  const [savedValue, setSavedValue] = React.useState(initialDocument);
  const [updatedAt, setUpdatedAt] = React.useState(initialUpdatedAt);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [justSaved, setJustSaved] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const [tab, setTab] = React.useState<Tab>(initial.ok ? "visual" : "json");
  const [model, setModel] = React.useState<PolicyModel>(initial.model);
  // The passthrough baseline: unknown top-level keys + original order. Captured
  // whenever we (re)parse the document into the visual model.
  const [root, setRoot] = React.useState<Record<string, unknown>>(initial.root);
  const [parseError, setParseError] = React.useState<string | null>(
    initial.ok ? null : (initial.error ?? PARSE_FALLBACK),
  );

  const dirty = value !== savedValue;
  const validity = React.useMemo<Validity>(() => validateHujson(value), [value]);
  const canSave = writable && dirty && !pending && value.trim() !== "";

  function clearTransient() {
    if (saveError) setSaveError(null);
    if (justSaved) setJustSaved(false);
  }

  const commit = React.useCallback(() => {
    if (!writable || value.trim() === "" || pending) return;
    setSaveError(null);
    setJustSaved(false);
    startTransition(async () => {
      const result = await savePolicy(value);
      if (result.status === "success") {
        setSavedValue(value);
        setUpdatedAt(result.updatedAt ?? new Date().toISOString());
        setJustSaved(true);
      } else {
        setSaveError(result.error ?? "Couldn't save the policy.");
      }
    });
  }, [value, pending, writable]);

  // Cmd/Ctrl-S commits from anywhere, pre-empting the browser's save dialog.
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (writable && dirty && value.trim() !== "") commit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commit, dirty, value, writable]);

  // Switching to Visual re-parses the current document so the builder reflects
  // any raw edits. A parse failure routes to a notice instead of the builder.
  function selectVisual() {
    const parsed = parsePolicy(value);
    setModel(parsed.model);
    setRoot(parsed.root);
    setParseError(parsed.ok ? null : (parsed.error ?? PARSE_FALLBACK));
    setTab("visual");
  }

  function selectJson() {
    setTab("json");
  }

  function onModelChange(next: PolicyModel) {
    setModel(next);
    setValue(serializePolicy(next, root));
    clearTransient();
  }

  function onJsonChange(next: string) {
    setValue(next);
    clearTransient();
  }

  return (
    <div className="flex h-[calc(100vh-15rem)] min-h-[32rem] flex-col overflow-hidden rounded-card border border-line bg-surface">
      {/* Console bar: tab switch + validity on the left, save state on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2/60 px-3 py-2.5">
        <div className="flex items-center gap-3">
          <SegmentedTabs
            options={TAB_OPTIONS}
            value={tab}
            onValueChange={(next) => (next === "visual" ? selectVisual() : selectJson())}
            ariaLabel="Policy editor view"
          />
          <ValidityBadge validity={validity} />
        </div>
        <div className="flex items-center gap-3">
          <SaveState
            dirty={dirty}
            pending={pending}
            justSaved={justSaved}
            updatedAt={updatedAt}
            unset={unset}
            writable={writable}
          />
          <Button variant="solid" size="sm" disabled={!canSave} onClick={commit}>
            <Save className="h-3.5 w-3.5" aria-hidden />
            {pending ? "Saving…" : "Save"}
            <Kbd className="ml-0.5 border-graphite-700/40 bg-graphite-950/15 text-graphite-900/70">
              ⌘S
            </Kbd>
          </Button>
        </div>
      </div>

      {/* Body: the active view fills the remaining height. */}
      {tab === "visual" ? (
        parseError ? (
          <ParseNotice message={parseError} onEditJson={selectJson} />
        ) : (
          <VisualEditor model={model} onChange={onModelChange} />
        )
      ) : (
        <JsonEditor
          value={value}
          onChange={onJsonChange}
          invalid={validity.kind === "invalid"}
        />
      )}

      {/* Status rail: parse / save detail, then the live counters. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line bg-surface-2/60 px-4 py-2 text-[11px]">
        <div className="min-w-0">
          {saveError ? (
            <span className="flex items-center gap-1.5 text-critical-500">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{saveError}</span>
            </span>
          ) : validity.kind === "invalid" ? (
            <span className="data flex items-center gap-1.5 text-warn-500">
              <span className="truncate">{validity.message}</span>
            </span>
          ) : tab === "visual" ? (
            <span className="text-ink-faint">
              Visual builder: edits write straight to the HuJSON document.
            </span>
          ) : (
            <span className="text-ink-faint">
              HuJSON allows comments and trailing commas.
            </span>
          )}
        </div>
        <div className="data flex shrink-0 items-center gap-3 text-ink-faint">
          <span>{value.split("\n").length.toLocaleString()} ln</span>
          <span>{value.length.toLocaleString()} ch</span>
        </div>
      </div>
    </div>
  );
}

function ValidityBadge({ validity }: { validity: Validity }) {
  if (validity.kind === "valid") {
    return (
      <span className="hidden items-center gap-1.5 text-xs font-medium text-online-500 sm:flex">
        <CircleCheck className="h-4 w-4" aria-hidden />
        Valid HuJSON
      </span>
    );
  }
  if (validity.kind === "invalid") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-warn-500">
        <TriangleAlert className="h-4 w-4" aria-hidden />
        Invalid syntax
      </span>
    );
  }
  return (
    <span className="hidden items-center gap-1.5 text-xs font-medium text-ink-faint sm:flex">
      <CircleSlash className="h-4 w-4" aria-hidden />
      Empty
    </span>
  );
}

function SaveState({
  dirty,
  pending,
  justSaved,
  updatedAt,
  unset,
  writable,
}: {
  dirty: boolean;
  pending: boolean;
  justSaved: boolean;
  updatedAt: string | null;
  unset: boolean;
  writable: boolean;
}) {
  if (!writable) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
        <CircleSlash className="h-3.5 w-3.5" aria-hidden />
        View only
      </span>
    );
  }
  if (pending) {
    return <span className="text-[11px] text-ink-faint">Committing…</span>;
  }
  if (dirty) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-beacon-500">
        <span className="h-1.5 w-1.5 rounded-full bg-beacon-500" aria-hidden />
        Unsaved changes
      </span>
    );
  }
  if (justSaved) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-online-500">
        <CircleCheck className="h-3.5 w-3.5" aria-hidden />
        Saved
      </span>
    );
  }
  const stamp = formatStamp(updatedAt);
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
      <Minus className="h-3.5 w-3.5" aria-hidden />
      {unset && !updatedAt ? "Not set" : stamp ? `Saved ${stamp}` : "In sync"}
    </span>
  );
}

/** Shown on the Visual tab when the current document can't be parsed. */
function ParseNotice({
  message,
  onEditJson,
}: {
  message: string;
  onEditJson: () => void;
}) {
  return (
    <div className="grid-field flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-card border border-warn-500/30 bg-warn-500/10 text-warn-500">
        <TriangleAlert className="h-5 w-5" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ink">
          Can&apos;t open the visual builder
        </p>
        <p className="mx-auto max-w-md text-xs text-ink-muted">
          The document has to parse before it can be edited section by section.
        </p>
        <p className="data mx-auto mt-1 max-w-md break-words text-[11px] text-warn-500">
          {message}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onEditJson}>
        <Braces className="h-3.5 w-3.5" aria-hidden />
        Fix in JSON
      </Button>
    </div>
  );
}

/** Render an absolute timestamp as a compact UTC readout. */
function formatStamp(ts: string | null): string | null {
  if (!ts) return null;
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)}Z`;
}
