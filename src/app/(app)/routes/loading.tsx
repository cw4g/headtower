import { Skeleton } from "@/components/ui/skeleton";

/** Schematic skeleton while route approvals stream in from the control plane. */
export default function RoutesLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-3 w-96 max-w-full" />
      </div>

      <div className="flex flex-col gap-4">
        {Array.from({ length: 2 }).map((_, card) => (
          <div
            key={card}
            className="overflow-hidden rounded-card border border-line bg-surface"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-5 w-20 rounded-md" />
            </div>
            {Array.from({ length: 2 }).map((_, row) => (
              <div
                key={row}
                className="flex items-center gap-4 border-b border-line px-4 py-3.5 last:border-0"
              >
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-5 w-16 rounded-[0.3rem]" />
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="ml-auto h-7 w-24 rounded-control" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
