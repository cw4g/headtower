import { Skeleton } from "@/components/ui/skeleton";

/** Schematic skeleton while the user directory streams in. */
export default function UsersLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-3 w-80 max-w-full" />
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="border-b border-line bg-surface-2/40 px-4 py-2.5">
          <Skeleton className="h-3 w-20" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-line px-4 py-3.5 last:border-0"
          >
            <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="ml-auto h-3.5 w-10" />
            <Skeleton className="h-5 w-16 rounded-md" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
