"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface TokenInputProps {
  /** Current tokens. */
  values: string[];
  /** Called with the next token list on any add/remove. */
  onChange: (next: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
  invalid?: boolean;
  /** Render tokens + input in mono (default true; policy refs are identifiers). */
  mono?: boolean;
}

/**
 * A chip / token editor for the policy builder: a field-shaped well of removable
 * tokens plus a trailing input. Enter or comma commits the draft (whitespace and
 * commas split a paste into several tokens); Backspace on an empty input removes
 * the last token. Duplicates are ignored so each reference appears once.
 */
export function TokenInput({
  values,
  onChange,
  placeholder,
  ariaLabel,
  id,
  invalid,
  mono = true,
}: TokenInputProps) {
  const [draft, setDraft] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  function commit(raw: string) {
    const parts = raw
      .split(/[,\s]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      setDraft("");
      return;
    }
    const next = [...values];
    for (const part of parts) {
      if (!next.includes(part)) next.push(part);
    }
    onChange(next);
    setDraft("");
  }

  function removeAt(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      if (draft.trim() !== "") commit(draft);
    } else if (event.key === "Backspace" && draft === "" && values.length > 0) {
      event.preventDefault();
      removeAt(values.length - 1);
    }
  }

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className={cn(
        "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-control border bg-surface-2 px-2 py-1.5 transition-colors",
        "focus-within:ring-2 focus-within:ring-beacon-500/40",
        invalid
          ? "border-critical-500"
          : "border-line-strong focus-within:border-beacon-500",
      )}
    >
      {values.map((value, index) => (
        <span
          key={`${value}-${index}`}
          className={cn(
            "inline-flex items-center gap-1 rounded-[0.3rem] border border-line-strong bg-surface px-1.5 py-0.5 text-xs text-ink",
            mono && "data",
          )}
        >
          {value}
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Remove ${value}`}
            onClick={(event) => {
              event.stopPropagation();
              removeAt(index);
            }}
            className="-mr-0.5 flex text-ink-faint transition-colors hover:text-critical-500"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        value={draft}
        aria-label={ariaLabel}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (draft.trim() !== "") commit(draft);
        }}
        placeholder={values.length === 0 ? placeholder : ""}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        className={cn(
          "min-w-[7ch] flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint",
          mono && "data",
        )}
      />
    </div>
  );
}
