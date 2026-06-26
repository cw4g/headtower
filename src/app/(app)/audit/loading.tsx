import { Skeleton } from "@/components/ui/skeleton";

/** Schematic skeleton while the audit trail reads from the local store. */
export default function AuditLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-hidden>
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>
        <Skeleton className="h-9 w-32 rounded-control" />
      </div>

      {/* Filter rail */}
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-40 rounded-control" />
        <Skeleton className="h-8 w-40 rounded-control" />
        <Skeleton className="h-8 w-40 rounded-control" />
      </div>

      {/* Trail table */}
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="border-b border-line bg-surface-2/40 px-4 py-2.5">
          <Skeleton className="h-3 w-24" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-line px-4 py-3.5 last:border-0"
          >
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="ml-auto h-3.5 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}
