import * as React from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "solid" | "ghost" | "outline" | "danger";
type ButtonSize = "sm" | "md";

const variantClasses: Record<ButtonVariant, string> = {
  // The single accent: reserve for the one primary action on a view.
  solid:
    "border-beacon-500 bg-beacon-500 text-graphite-950 hover:bg-beacon-400 active:bg-beacon-600",
  ghost:
    "border-transparent bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink",
  outline:
    "border-line-strong bg-surface text-ink hover:border-ink-faint hover:bg-surface-2",
  danger:
    "border-critical-500 bg-critical-500 text-white hover:opacity-90 active:opacity-100",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-2.5 text-xs",
  md: "h-9 gap-2 px-3.5 text-sm",
};

export interface ButtonProps extends React.ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * Console action. Default is `outline` so the beacon accent stays scarce; opt
 * into `variant="solid"` for the single primary action on a view.
 */
export function Button({
  className,
  variant = "outline",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap rounded-control border font-medium",
        "transition-[color,background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.97]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        "disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
