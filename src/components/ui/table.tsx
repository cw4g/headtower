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

/**
 * Responsive table helpers. A wide `<Table>` on a narrow screen just scrolls
 * horizontally, which pushes a trailing actions column off-screen - fine for a
 * secondary readout, but not for a table whose row identity and actions need
 * to stay reachable together. Pair `TableDesktop` (wraps the `<Table>`, hidden
 * below `md`) with `CardRows`/`CardRow` (a stacked one-row-per-card fallback,
 * hidden at `md` and up) inside the same `Card` so only one presentation of
 * the same data ever renders at a time.
 */
export function TableDesktop({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("hidden md:block", className)} {...props} />;
}

/** Small-screen row list; sibling of `TableDesktop` inside the same `Card`. */
export function CardRows({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col md:hidden", className)} {...props} />;
}

/**
 * One stacked row-as-card: identity/content on the left, actions pinned on the
 * right so they never scroll out of reach. Hairline divider mirrors `Tr`.
 */
export function CardRow({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 border-b border-line px-3 py-3 last:border-0",
        className,
      )}
      {...props}
    />
  );
}

/** Two-up grid of `CardRowField`s - the small-screen equivalent of table columns. */
export function CardRowMeta({ className, ...props }: React.ComponentProps<"dl">) {
  return <dl className={cn("grid grid-cols-2 gap-x-3 gap-y-1.5", className)} {...props} />;
}

export interface CardRowFieldProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}
/** One labelled value in a `CardRowMeta` grid - a column header + cell, stacked. */
export function CardRowField({ label, children, className }: CardRowFieldProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-ink-faint">
        {label}
      </dt>
      <dd className="mt-0.5 text-xs text-ink-muted">{children}</dd>
    </div>
  );
}
