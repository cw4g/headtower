"use client";

import * as React from "react";
import {
  CircleCheck,
  CircleSlash,
  Minus,
  Save,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { savePolicy } from "./actions";

interface PolicyEditorProps {
  /** The HuJSON document read from the control plane (may be empty/unset). */
  initialDocument: string;
  /** When the stored policy was last updated; null if never set. */
  initialUpdatedAt: string | null;
  /** True when the read returned no document yet — first authoring. */
  unset?: boolean;
}

type Validity =
  | { kind: "empty" }
  | { kind: "valid" }
  | { kind: "invalid"; message: string };

/**
 * The policy editor: a schematic, full-height HuJSON workbench. A line-gutter
 * textarea (mono + tabular) with live JSON/HuJSON parse validity, a saved /
 * unsaved indicator, a single beacon Save action, and Cmd-S to commit. The save
 * is a real Server Action; Headscale validates the document authoritatively.
 */
export function PolicyEditor({
  initialDocument,
  initialUpdatedAt,
  unset = false,
}: PolicyEditorProps) {
  const [value, setValue] = React.useState(initialDocument);
  // The last document the control plane confirmed. Drives the dirty indicator.
  const [savedValue, setSavedValue] = React.useState(initialDocument);
  const [updatedAt, setUpdatedAt] = React.useState(initialUpdatedAt);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [justSaved, setJustSaved] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const gutterRef = React.useRef<HTMLDivElement>(null);

  const dirty = value !== savedValue;
  const validity = React.useMemo<Validity>(() => validateHujson(value), [value]);
  const canSave = dirty && !pending && value.trim() !== "";

  const lineCount = React.useMemo(
    () => Math.max(value.split("\n").length, 1),
    [value],
  );

  const commit = React.useCallback(() => {
    if (value.trim() === "" || pending) return;
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
  }, [value, pending]);

  // Cmd/Ctrl-S commits from anywhere on the view, intercepting the browser's
  // own save dialog.
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty && value.trim() !== "") commit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commit, dirty, value]);

  // Keep the line gutter aligned with the textarea's vertical scroll.
  function onScroll(event: React.UIEvent<HTMLTextAreaElement>) {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  }

  function onChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(event.target.value);
    if (saveError) setSaveError(null);
    if (justSaved) setJustSaved(false);
  }

  // Tab inserts two spaces rather than moving focus — this is a code surface.
  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Tab") {
      event.preventDefault();
      const el = event.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = value.slice(0, start) + "  " + value.slice(end);
      setValue(next);
      // Restore the caret after React re-renders with the new value.
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
    }
  }

  return (
    <div className="flex h-[calc(100vh-15rem)] min-h-[26rem] flex-col overflow-hidden rounded-card border border-line bg-surface">
      {/* Console bar: validity readout on the left, save state on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2/60 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <ValidityBadge validity={validity} />
          <span className="data hidden text-[11px] text-ink-faint sm:inline">
            policy.hujson
          </span>
        </div>
        <div className="flex items-center gap-3">
          <SaveState
            dirty={dirty}
            pending={pending}
            justSaved={justSaved}
            updatedAt={updatedAt}
            unset={unset}
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

      {/* Editor body: line gutter + the HuJSON textarea. */}
      <div className="relative flex min-h-0 flex-1">
        <div
          ref={gutterRef}
          aria-hidden
          className="data hidden shrink-0 select-none overflow-hidden border-r border-line bg-surface-2/40 py-3 pl-4 pr-3 text-right text-[13px] leading-[1.5rem] text-ink-faint sm:block"
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={onChange}
          onScroll={onScroll}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          wrap="off"
          aria-label="Policy document (HuJSON)"
          aria-invalid={validity.kind === "invalid" || undefined}
          placeholder={PLACEHOLDER}
          className="data min-h-0 flex-1 resize-none bg-transparent px-4 py-3 text-[13px] leading-[1.5rem] text-ink outline-none placeholder:text-ink-faint/70"
        />
      </div>

      {/* Status rail: parse detail or save error, then the live counters. */}
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
          ) : (
            <span className="text-ink-faint">
              HuJSON — comments and trailing commas are allowed.
            </span>
          )}
        </div>
        <div className="data flex shrink-0 items-center gap-3 text-ink-faint">
          <span>{lineCount.toLocaleString()} ln</span>
          <span>{value.length.toLocaleString()} ch</span>
        </div>
      </div>
    </div>
  );
}

function ValidityBadge({ validity }: { validity: Validity }) {
  if (validity.kind === "valid") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-online-500">
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
    <span className="flex items-center gap-1.5 text-xs font-medium text-ink-faint">
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
}: {
  dirty: boolean;
  pending: boolean;
  justSaved: boolean;
  updatedAt: string | null;
  unset: boolean;
}) {
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
      {unset && !updatedAt
        ? "Not set"
        : stamp
          ? `Saved ${stamp}`
          : "In sync"}
    </span>
  );
}

const PLACEHOLDER = `{
  // Headscale ACL policy (HuJSON). A visual editor lands later.
  "acls": [
    { "action": "accept", "src": ["*"], "dst": ["*:*"] }
  ]
}`;

/**
 * Best-effort HuJSON validation in the browser. HuJSON (JWCC) is JSON plus
 * line/block comments and trailing commas, so we strip those — string-aware —
 * then hand the result to JSON.parse. Headscale remains the authoritative
 * validator on save; this only powers the inline readout.
 */
function validateHujson(source: string): Validity {
  if (source.trim() === "") return { kind: "empty" };
  try {
    JSON.parse(stripHujson(source));
    return { kind: "valid" };
  } catch (err) {
    return { kind: "invalid", message: cleanParseMessage(err) };
  }
}

/** Strip // and /* *\/ comments and trailing commas, respecting string spans. */
function stripHujson(source: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (inString) {
      out += c;
      if (c === "\\") {
        // Copy the escaped character verbatim.
        out += source[i + 1] ?? "";
        i++;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i++; // skip the closing '/'
      continue;
    }
    out += c;
  }
  // Drop trailing commas before a closing brace/bracket.
  return out.replace(/,(\s*[}\]])/g, "$1");
}

function cleanParseMessage(err: unknown): string {
  if (err instanceof Error) {
    // Browsers prefix with "JSON.parse:" or "Unexpected token"; trim noise.
    return err.message.replace(/^JSON\.parse:\s*/i, "").trim();
  }
  return "Document is not valid HuJSON.";
}

/** Render an absolute timestamp as a compact UTC readout. */
function formatStamp(ts: string | null): string | null {
  if (!ts) return null;
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)}Z`;
}
