"use client";

import * as React from "react";
import Link from "next/link";
import { SquareTerminal } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";

export interface TerminalActionProps {
  /** Headscale node id, used to link to the dedicated terminal page. */
  id: string;
  /** Operator-facing node name, used in the accessible label / tooltip. */
  name: string;
}

/**
 * "Terminal" action for a node's detail page: a compact icon link that opens
 * the dedicated SSH terminal page (`/machines/[id]/terminal`) in a new
 * browser tab, so a live shell keeps running independent of this page.
 *
 * Purely presentational - the `ssh.connect` gate lives with the caller (only
 * rendered when `canSsh && sshHost`); the terminal page re-checks the same
 * capability server-side before it opens.
 */
export function TerminalAction({ id, name }: TerminalActionProps) {
  return (
    <Tooltip content="Open terminal">
      <Link
        href={`/machines/${id}/terminal`}
        target="_blank"
        rel="noopener"
        aria-label={`Open terminal for ${name}`}
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-line-strong bg-surface text-ink-muted",
          "transition-colors hover:border-ink-faint hover:bg-surface-2 hover:text-ink",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        )}
      >
        <SquareTerminal className="h-4 w-4" aria-hidden />
      </Link>
    </Tooltip>
  );
}
