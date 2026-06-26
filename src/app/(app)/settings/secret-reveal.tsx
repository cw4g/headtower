"use client";

import * as React from "react";
import { CopyButton } from "@/components/ui/copy-button";

export interface SecretRevealProps {
  /** The secret value to display and copy. */
  value: string;
  /** Accessible label for the copy control. */
  copyLabel?: string;
}

/**
 * A one-time secret readout: the full value in a mono, wrap-anywhere box with a
 * copy control. Used right after a key is minted, where the secret is shown once
 * and never again.
 */
export function SecretReveal({ value, copyLabel = "Copy key" }: SecretRevealProps) {
  return (
    <div className="flex items-start gap-2 rounded-control border border-line-strong bg-surface-2 p-3">
      <code className="data min-w-0 flex-1 break-all text-xs leading-relaxed text-ink">
        {value}
      </code>
      <CopyButton value={value} label={copyLabel} className="mt-0.5" />
    </div>
  );
}
