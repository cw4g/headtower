"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/cn";

/** Wrap one provider high in the tree if you want shared open/close timing. */
export const TooltipProvider = TooltipPrimitive.Provider;

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  delayDuration?: number;
  className?: string;
}

/** Self-contained tooltip: pass the trigger as children, the copy as `content`. */
export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  delayDuration = 200,
  className,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            sideOffset={6}
            className={cn(
              "z-50 max-w-xs rounded-control border border-line-strong bg-surface-2 px-2 py-1 text-xs text-ink shadow-lg shadow-graphite-950/30",
              className,
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-surface-2" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
