import { Skeleton } from "@/components/ui/skeleton";

/** Schematic skeleton while a machine's full detail readout streams in. */
export default function MachineDetailLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-hidden>
      <Skeleton className="h-4 w-24" />

      {/* Detail header: status dot, name, chip row */}
      <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Skeleton className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-control" />
            <Skeleton className="h-8 w-8 rounded-control" />
            <Skeleton className="h-3 w-10" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Skeleton className="h-5 w-16 rounded-md" />
          <Skeleton className="h-5 w-24 rounded-md" />
          <Skeleton className="h-5 w-20 rounded-md" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {/* Metadata */}
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="flex flex-col gap-3 p-4">
              <Skeleton className="h-3.5 w-3/4 max-w-full" />
              <Skeleton className="h-3.5 w-1/2 max-w-full" />
              <div className="flex gap-1.5">
                <Skeleton className="h-5 w-14 rounded-md" />
                <Skeleton className="h-5 w-16 rounded-md" />
              </div>
            </div>
          </div>

          {/* Addresses */}
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex flex-col gap-3 p-4">
              {Array.from({ length: 2 }).map((_, row) => (
                <div
                  key={row}
                  className="flex items-center justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0"
                >
                  <Skeleton className="h-3 w-10" />
                  <Skeleton className="h-3.5 w-32" />
                </div>
              ))}
            </div>
          </div>

          {/* Routes */}
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="flex flex-col gap-4 p-4">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-20 rounded-md" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-32" />
                <div className="flex flex-wrap gap-1.5">
                  <Skeleton className="h-5 w-20 rounded-md" />
                  <Skeleton className="h-5 w-16 rounded-md" />
                </div>
              </div>
            </div>
          </div>

          {/* Keys & expiry */}
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-12" />
            </div>
            <div className="flex flex-col gap-4 p-4">
              <Skeleton className="h-8 w-full rounded-control" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
              {Array.from({ length: 3 }).map((_, row) => (
                <div
                  key={row}
                  className="flex items-center justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0"
                >
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3.5 w-40" />
                </div>
              ))}
            </div>
          </div>

          {/* Identity */}
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="flex flex-col gap-3 p-4">
              {Array.from({ length: 5 }).map((_, row) => (
                <div
                  key={row}
                  className="flex items-center justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0"
                >
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3.5 w-28" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {/* Connectivity */}
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-2.5 w-2.5 shrink-0 rounded-full" />
            </div>
            <div className="flex flex-col gap-3 p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
              <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-20 rounded-md" />
              </div>
            </div>
          </div>

          {/* Recent activity */}
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-6" />
            </div>
            <div className="flex flex-col gap-4 p-4">
              <Skeleton className="h-10 w-full" />
              {Array.from({ length: 3 }).map((_, row) => (
                <div
                  key={row}
                  className="flex flex-col gap-1 border-b border-line pb-2.5 last:border-0 last:pb-0"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
