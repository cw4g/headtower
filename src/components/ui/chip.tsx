import * as React from "react";
import { cn } from "@/lib/cn";

type ChipVariant =
  | "default"
  | "outline"
  | "beacon"
  | "online"
  | "warn"
  | "critical";

const chipVariants: Record<ChipVariant, string> = {
  default: "border-line bg-surface-2 text-ink-muted",
  outline: "border-line-strong bg-transparent text-ink-muted",
  beacon: "border-beacon-500/30 bg-beacon-500/10 text-beacon-500",
  online: "border-online-500/30 bg-online-500/10 text-online-500",
  warn: "border-warn-500/30 bg-warn-500/10 text-warn-500",
  critical: "border-critical-500/30 bg-critical-500/10 text-critical-500",
};

export interface ChipProps extends React.ComponentProps<"span"> {
  variant?: ChipVariant;
  /** mono + tabular for counts / short codes. */
  mono?: boolean;
}

/** A small labelled pill. Status variants are functional, never decorative. */
export function Chip({
  className,
  variant = "default",
  mono = false,
  ...props
}: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium",
        mono && "data font-normal",
        chipVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

/** A tailnet identifier token (tags, hostnames) — always mono. */
export function Tag({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "data inline-flex items-center rounded-[0.3rem] border border-line-strong bg-surface-2 px-1.5 py-0.5 text-xs text-ink-muted",
        className,
      )}
      {...props}
    />
  );
}
