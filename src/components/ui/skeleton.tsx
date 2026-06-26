import { cn } from "@/lib/cn";

/**
 * A single schematic placeholder block. Used inside route `loading.tsx` files
 * while the real readout streams in; put `animate-pulse` on a shared parent so
 * every block in a view breathes in sync.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rounded bg-surface-2", className)} />;
}

/**
 * A placeholder readout table: a header bar over `rows` hairline-divided lines,
 * matching the proportions of the console's data tables.
 */
export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="border-b border-line bg-surface-2/40 px-4 py-2.5">
        <Skeleton className="h-3 w-24" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-line px-4 py-3.5 last:border-0"
        >
          <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="ml-auto h-3.5 w-28" />
          <Skeleton className="h-3.5 w-20" />
        </div>
      ))}
    </div>
  );
}
