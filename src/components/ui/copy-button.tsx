"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";

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
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard unavailable (insecure context); fail quietly.
    }
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
