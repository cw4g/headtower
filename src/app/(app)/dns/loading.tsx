import { Skeleton } from "@/components/ui/skeleton";

/** Schematic skeleton for the DNS readout. */
export default function DnsLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-3 w-96 max-w-full" />
      </div>

      {/* Notice panel */}
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="flex items-start gap-4 border-b border-line px-5 py-5">
          <Skeleton className="h-10 w-10 shrink-0 rounded-card" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-64 max-w-full" />
            <Skeleton className="h-3 w-[28rem] max-w-full" />
            <Skeleton className="h-3 w-80 max-w-full" />
          </div>
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0">
            <Skeleton className="h-3.5 w-3.5 shrink-0" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
        ))}
      </div>

      {/* Key reference card */}
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-5 w-8 rounded-md" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line px-4 py-3 last:border-0">
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
