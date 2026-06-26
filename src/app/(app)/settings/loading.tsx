import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

/**
 * Schematic skeleton for the settings content column. The settings layout keeps
 * the heading and section rail mounted, so this fills only the routed pane.
 */
export default function SettingsLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-5" aria-hidden>
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>
        <Skeleton className="h-9 w-28 rounded-control" />
      </div>

      <SkeletonTable rows={5} />
    </div>
  );
}
