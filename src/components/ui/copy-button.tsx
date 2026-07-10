"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";
import { toast } from "@/components/ui/toast";

/** Copies via a hidden, briefly-focused textarea + execCommand fallback. */
function copyWithTextarea(value: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, value.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  } finally {
    document.body.removeChild(textarea);
  }
  return ok;
}

export interface CopyButtonProps {
  /** The text placed on the clipboard. */
  value: string;
  /** Accessible label; defaults to "Copy". */
  label?: string;
  className?: string;
}

/** A quiet icon button that copies a value and flips to a check for a beat. */
export function CopyButton({ value, label = "Copy", className }: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    let ok = false;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(value);
        ok = true;
      }
    } catch {
      ok = false;
    }
    // Clipboard API missing or denied (e.g. insecure HTTP origin) - fall
    // back to the textarea + execCommand trick rather than failing quietly.
    if (!ok) ok = copyWithTextarea(value);

    if (!ok) {
      toast.error("Couldn't copy - copy it manually");
      return;
    }

    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1200);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : label}
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[0.3rem] text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40",
        className,
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-online-500" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
    </button>
  );
}
