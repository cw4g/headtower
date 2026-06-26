import { Skeleton } from "@/components/ui/skeleton";

/** Schematic skeleton while the dashboard reads live tailnet state. */
export default function DashboardLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-hidden>
      {/* Heading */}
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-3 w-72" />
      </div>

      {/* Coverage panel */}
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="flex h-[clamp(260px,40vw,440px)] items-center justify-center">
          <Skeleton className="h-40 w-[70%] max-w-2xl rounded-full" />
        </div>
      </div>

      {/* Readout strip */}
      <div className="grid grid-cols-4 divide-x divide-line overflow-hidden rounded-card border border-line bg-surface">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2.5 px-4 py-4 sm:px-6 sm:py-5">
            <Skeleton className="h-2.5 w-14" />
            <Skeleton className="h-7 w-12" />
          </div>
        ))}
      </div>

      {/* Needs attention */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5 last:border-0"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-2.5 w-28" />
                </div>
              </div>
              <Skeleton className="h-5 w-20 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
