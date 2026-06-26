import * as React from "react";
import { cn } from "@/lib/cn";

type Status = "online" | "warn" | "critical" | "idle";

const dotColor: Record<Status, string> = {
  online: "bg-online-500",
  warn: "bg-warn-500",
  critical: "bg-critical-500",
  idle: "bg-ink-faint",
};

export interface StatusDotProps extends React.ComponentProps<"span"> {
  status: Status;
  /** Animate a signal ring (online only) — motion that reports, not decorates. */
  pulse?: boolean;
  label?: React.ReactNode;
}

export function StatusDot({
  status,
  pulse = false,
  label,
  className,
  ...props
}: StatusDotProps) {
  const indicator = (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      {pulse && status === "online" && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
            dotColor[status],
          )}
          aria-hidden
        />
      )}
      <span
        className={cn("relative inline-flex h-2 w-2 rounded-full", dotColor[status])}
      />
    </span>
  );

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      {...props}
    >
      {indicator}
      {label != null && <span className="text-xs text-ink-muted">{label}</span>}
    </span>
  );
}
