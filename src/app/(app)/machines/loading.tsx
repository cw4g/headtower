import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

/** Schematic skeleton while the machines readout streams in. */
export default function MachinesLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3 w-72" />
      </div>

      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-8 w-56 rounded-control" />
      </div>

      <SkeletonTable rows={6} />
    </div>
  );
}
