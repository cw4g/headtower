import { Skeleton } from "@/components/ui/skeleton";

/** Schematic skeleton while the access policy loads into the workbench. */
export default function AccessLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-3 w-96 max-w-full" />
      </div>

      {/* Workbench toolbar: a standalone row - tabs on the left, save on the right. */}
      <div className="flex items-center justify-between rounded-card border border-line bg-surface-2/60 px-3 py-2.5">
        <div className="flex gap-1">
          <Skeleton className="h-7 w-20 rounded-control" />
          <Skeleton className="h-7 w-16 rounded-control" />
        </div>
        <Skeleton className="h-7 w-24 rounded-control" />
      </div>

      {/* Editor body: section-card skeletons flowing directly in the page column. */}
      <div className="flex flex-col gap-4">
        {[
          ["w-3/4", "w-1/2", "w-5/6", "w-2/3"],
          ["w-4/5", "w-1/3", "w-3/5", "w-2/3"],
        ].map((widths, i) => (
          <div key={i} className="rounded-card border border-line bg-surface p-5">
            <div className="flex flex-col gap-3">
              {widths.map((w, j) => (
                <Skeleton key={j} className={`h-3.5 ${w}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
