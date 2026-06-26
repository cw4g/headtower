import * as React from "react";
import { cn } from "@/lib/cn";

/** A keycap, for surfacing the keyboard-first shortcuts everywhere. */
export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "data inline-flex h-5 min-w-5 items-center justify-center rounded-[0.3rem] border border-line-strong bg-surface-2 px-1.5 text-[11px] leading-none text-ink-muted",
        className,
      )}
      {...props}
    />
  );
}
