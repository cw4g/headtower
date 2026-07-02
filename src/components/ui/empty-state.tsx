import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/** Signal tone: neutral "no signal" (default), or a critical/warn fault. */
export type EmptyStateTone = "default" | "critical" | "warn";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Primary affordance, e.g. a Button - or a trailing diagnostic line. */
  action?: React.ReactNode;
  /** Tints the dashed frame and icon badge. Defaults to the neutral "default". */
  tone?: EmptyStateTone;
  className?: string;
}

/** Dashed frame colour per tone. */
const TONE_FRAME: Record<EmptyStateTone, string> = {
  default: "border-line-strong",
  critical: "border-critical-500/40",
  warn: "border-warn-500/40",
};

/** Icon badge (border + fill + glyph) per tone. */
const TONE_BADGE: Record<EmptyStateTone, string> = {
  default: "border-line bg-surface text-ink-faint",
  critical: "border-critical-500/30 bg-critical-500/10 text-critical-500",
  warn: "border-warn-500/30 bg-warn-500/10 text-warn-500",
};

/** A schematic "no signal" panel: dashed frame over the hairline grid. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "default",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "grid-field flex flex-col items-center justify-center gap-3 rounded-card border border-dashed px-6 py-14 text-center",
        TONE_FRAME[tone],
        className,
      )}
    >
      {Icon && (
        <span
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-card border",
            TONE_BADGE[tone],
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      )}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        {description != null && (
          <p className="mx-auto max-w-sm text-xs text-ink-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
