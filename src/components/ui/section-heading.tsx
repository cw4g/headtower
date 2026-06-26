import * as React from "react";
import { cn } from "@/lib/cn";

export interface SectionHeadingProps {
  title: React.ReactNode;
  /** Mono micro-label above the title — the one place the accent leads. */
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned actions (buttons, filters). */
  children?: React.ReactNode;
  className?: string;
}

export function SectionHeading({
  title,
  eyebrow,
  description,
  children,
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn("flex flex-wrap items-end justify-between gap-4", className)}
    >
      <div className="flex flex-col gap-1">
        {eyebrow != null && (
          <span className="data text-[11px] uppercase tracking-[0.12em] text-beacon-500">
            {eyebrow}
          </span>
        )}
        <h1 className="text-lg font-semibold tracking-tight text-ink">{title}</h1>
        {description != null && (
          <p className="text-sm text-ink-muted">{description}</p>
        )}
      </div>
      {children != null && (
        <div className="flex items-center gap-2">{children}</div>
      )}
    </div>
  );
}
