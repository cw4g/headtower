import * as React from "react";
import { cn } from "@/lib/cn";

export interface SurfaceProps extends React.ComponentProps<"div"> {
  /** 1 = bg-surface (panel), 2 = bg-surface-2 (recessed / inset). */
  level?: 1 | 2;
  bordered?: boolean;
  /** Lay the schematic hairline grid behind the contents. */
  grid?: boolean;
}

/** The base panel primitive every composed surface is built from. */
export function Surface({
  className,
  level = 1,
  bordered = true,
  grid = false,
  ...props
}: SurfaceProps) {
  return (
    <div
      className={cn(
        "rounded-card",
        level === 1 ? "bg-surface" : "bg-surface-2",
        bordered && "border border-line",
        grid && "grid-field",
        className,
      )}
      {...props}
    />
  );
}
