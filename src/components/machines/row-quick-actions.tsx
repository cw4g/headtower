"use client";

import Link from "next/link";
import { SquareTerminal } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/cn";
import type { NodeView } from "@/lib/machines";

/**
 * The SSH host the terminal page connects to, derived exactly as the node detail
 * and terminal pages do (`view.ipv4 || view.ipv6 || view.hostname`), so a row's
 * quick "Open terminal" link points at the same target the page opens.
 */
function sshHostFor(node: NodeView): string | null {
  return node.ipv4 || node.ipv6 || node.hostname || null;
}

/**
 * Hover/focus-revealed quick-action cluster for a machine row or card: the two
 * verbs an operator reaches for most - open an SSH terminal and copy the node's
 * primary address - surfaced without first opening the kebab. Quiet at rest
 * (ink-faint, opacity-0), the cluster fades in with the surrounding `group`'s
 * hover/focus-within state and lights the beacon only on hover, so the resting
 * row stays calm. The kebab remains the full action set; this is a shortcut.
 *
 * The terminal link mirrors the detail page's gate: it appears only when the
 * agent sidecar reports the node (so a shell can actually be brokered over the
 * tailnet) and the node has an address/hostname to reach. The terminal page
 * re-checks the `ssh.connect` capability server-side before it opens.
 *
 * `className` is merged onto the cluster wrapper so a caller can float it (the
 * card corner adds a translucent backdrop; the table cell needs none).
 */
export function RowQuickActions({
  node,
  className,
}: {
  node: NodeView;
  className?: string;
}) {
  const sshHost = sshHostFor(node);
  const canOpenTerminal = node.agent != null && sshHost != null;
  const primaryAddr = node.ipv4 ?? node.ipv6;

  // Nothing worth surfacing - render nothing so the cluster never reserves
  // dead space next to the kebab.
  if (!canOpenTerminal && !primaryAddr) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none",
        className,
      )}
    >
      {canOpenTerminal && (
        <Tooltip content="Open terminal">
          <Link
            href={`/machines/${node.id}/terminal`}
            target="_blank"
            rel="noopener"
            aria-label={`Open terminal for ${node.name}`}
            // Sibling of the row's own navigation - stop the click so opening a
            // terminal never also opens the detail view underneath it.
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[0.3rem] text-ink-faint transition-colors hover:bg-surface-2 hover:text-beacon-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40",
            )}
          >
            <SquareTerminal className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </Tooltip>
      )}
      {primaryAddr && (
        <Tooltip content="Copy IP">
          {/* CopyButton isn't a forwardRef component, so give Radix a span to
              anchor the tooltip to rather than the button itself. */}
          <span className="inline-flex">
            <CopyButton value={primaryAddr} label="Copy IP" />
          </span>
        </Tooltip>
      )}
    </div>
  );
}
