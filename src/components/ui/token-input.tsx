"use client";

import * as React from "react";
import { createPortal } from "react-dom";
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
  /**
   * Known names to offer as an accessible autocomplete popover, filtered as
   * the draft is typed. Already-chosen tokens are excluded. Omit for a plain
   * free-text field.
   */
  suggestions?: string[];
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
  suggestions,
}: TokenInputProps) {
  const [draft, setDraft] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [popoverRect, setPopoverRect] = React.useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const wellRef = React.useRef<HTMLDivElement>(null);
  const generatedId = React.useId();
  const listboxId = `${id ?? generatedId}-listbox`;

  const hasSuggestions = !!suggestions && suggestions.length > 0;
  const filtered = React.useMemo(() => {
    if (!hasSuggestions) return [];
    const needle = draft.trim().toLowerCase();
    const chosen = new Set(values);
    const pool = suggestions.filter((s) => !chosen.has(s));
    const matches = needle === "" ? pool : pool.filter((s) => s.toLowerCase().includes(needle));
    return matches.slice(0, 20);
  }, [hasSuggestions, suggestions, draft, values]);

  const showPopover = hasSuggestions && open && filtered.length > 0;
  const activeId =
    showPopover && activeIndex >= 0 && activeIndex < filtered.length
      ? `${listboxId}-${activeIndex}`
      : undefined;

  // Portalled to <body> and positioned via getBoundingClientRect so the
  // popover escapes the ancestor Card's `overflow-hidden` and the editor's
  // scroll container instead of being clipped.
  React.useLayoutEffect(() => {
    if (!showPopover) return;
    function place() {
      const el = wellRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPopoverRect({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [showPopover]);

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
    setOpen(false);
    setActiveIndex(-1);
  }

  function removeAt(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (showPopover) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
        return;
      }
    }
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      if (showPopover && activeIndex >= 0 && filtered[activeIndex]) {
        commit(filtered[activeIndex]);
        return;
      }
      if (draft.trim() !== "") commit(draft);
    } else if (event.key === "Backspace" && draft === "" && values.length > 0) {
      event.preventDefault();
      removeAt(values.length - 1);
    }
  }

  return (
    <>
      <div
        ref={wellRef}
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
          role={hasSuggestions ? "combobox" : undefined}
          aria-autocomplete={hasSuggestions ? "list" : undefined}
          aria-expanded={hasSuggestions ? showPopover : undefined}
          aria-controls={hasSuggestions ? listboxId : undefined}
          aria-activedescendant={activeId}
          onChange={(event) => {
            setDraft(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => {
            if (hasSuggestions) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            setOpen(false);
            setActiveIndex(-1);
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
      {showPopover &&
        popoverRect &&
        typeof document !== "undefined" &&
        createPortal(
          <ul
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel ? `${ariaLabel} suggestions` : "Suggestions"}
            style={{
              position: "fixed",
              top: popoverRect.top,
              left: popoverRect.left,
              width: popoverRect.width,
            }}
            className="z-50 max-h-48 overflow-y-auto rounded-control border border-line-strong bg-surface p-1 shadow-xl shadow-graphite-950/30"
          >
            {filtered.map((suggestion, index) => (
              <li key={suggestion} role="presentation">
                <button
                  type="button"
                  id={`${listboxId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  tabIndex={-1}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    commit(suggestion);
                    inputRef.current?.focus();
                  }}
                  className={cn(
                    "data flex w-full items-center truncate rounded-[0.3rem] px-2 py-1.5 text-left text-xs transition-colors",
                    index === activeIndex
                      ? "bg-beacon-500/10 text-ink"
                      : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
