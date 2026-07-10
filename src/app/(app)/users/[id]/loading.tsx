import { Skeleton } from "@/components/ui/skeleton";

/** Schematic skeleton while a user's account and owned nodes stream in. */
export default function UserDetailLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-hidden>
      <Skeleton className="h-4 w-16" />

      {/* Detail header: avatar, name, chip row */}
      <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-56 max-w-full" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-control" />
            <Skeleton className="h-3 w-10" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Skeleton className="h-5 w-14 rounded-md" />
          <Skeleton className="h-5 w-20 rounded-md" />
          <Skeleton className="h-5 w-20 rounded-md" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {/* Owned nodes */}
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-4" />
            </div>
            {Array.from({ length: 4 }).map((_, row) => (
              <div
                key={row}
                className="flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-0"
              >
                <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="hidden h-3 w-20 sm:block" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {/* Identity */}
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="flex flex-col gap-3 p-4">
              {Array.from({ length: 6 }).map((_, row) => (
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
      </div>
    </div>
  );
}
