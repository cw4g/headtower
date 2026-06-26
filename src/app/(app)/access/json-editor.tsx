"use client";

import * as React from "react";

interface JsonEditorProps {
  value: string;
  onChange: (next: string) => void;
  /** Marks the textarea invalid for assistive tech when the parse fails. */
  invalid?: boolean;
}

/**
 * The raw HuJSON panel: a line-gutter textarea (mono + tabular) that fills its
 * container. Tab inserts two spaces rather than moving focus, and the gutter
 * tracks the textarea's scroll. Validity, save state, and counters are owned by
 * the surrounding workbench.
 */
export function JsonEditor({ value, onChange, invalid }: JsonEditorProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const gutterRef = React.useRef<HTMLDivElement>(null);

  const lineCount = React.useMemo(
    () => Math.max(value.split("\n").length, 1),
    [value],
  );

  function onScroll(event: React.UIEvent<HTMLTextAreaElement>) {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = event.currentTarget.scrollTop;
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Tab") {
      event.preventDefault();
      const el = event.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = value.slice(0, start) + "  " + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
    }
  }

  return (
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
        onChange={(event) => onChange(event.target.value)}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        wrap="off"
        aria-label="Policy document (HuJSON)"
        aria-invalid={invalid || undefined}
        placeholder={PLACEHOLDER}
        className="data min-h-0 flex-1 resize-none bg-transparent px-4 py-3 text-[13px] leading-[1.5rem] text-ink outline-none placeholder:text-ink-faint/70"
      />
    </div>
  );
}

const PLACEHOLDER = `{
  // Headscale ACL policy (HuJSON) - comments and trailing commas are allowed.
  "acls": [
    { "action": "accept", "src": ["*"], "dst": ["*:*"] }
  ]
}`;
