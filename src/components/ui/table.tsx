import * as React from "react";
import { cn } from "@/lib/cn";

type Align = "left" | "right" | "center";

const alignClass: Record<Align, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

/** Schematic readout table. Wraps in an x-scroll container. */
export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn("w-full border-collapse text-sm", className)}
        {...props}
      />
    </div>
  );
}

export function TableHead({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={className} {...props} />;
}

export function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={className} {...props} />;
}

/** A body row: hairline divider + hover highlight. */
export function Tr({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b border-line transition-colors last:border-0 hover:bg-surface-2/60",
        className,
      )}
      {...props}
    />
  );
}

export interface ThProps extends React.ComponentProps<"th"> {
  align?: Align;
}
/** Column header: uppercase micro-label, like an instrument legend. */
export function Th({ className, align = "left", ...props }: ThProps) {
  return (
    <th
      className={cn(
        "border-b border-line px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint",
        alignClass[align],
        className,
      )}
      {...props}
    />
  );
}

export interface TdProps extends React.ComponentProps<"td"> {
  /** Render as a data readout (mono + tabular) for IDs / IPs / counts. */
  data?: boolean;
  align?: Align;
}
export function Td({ className, data = false, align = "left", ...props }: TdProps) {
  return (
    <td
      className={cn(
        "px-3 py-2.5 align-middle text-ink",
        data && "data",
        alignClass[align],
        className,
      )}
      {...props}
    />
  );
}
