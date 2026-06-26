import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Primary affordance, e.g. a Button. */
  action?: React.ReactNode;
  className?: string;
}

/** A schematic "no signal" panel: dashed frame over the hairline grid. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "grid-field flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line-strong px-6 py-14 text-center",
        className,
      )}
    >
      {Icon && (
        <span className="flex h-10 w-10 items-center justify-center rounded-card border border-line bg-surface text-ink-faint">
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
