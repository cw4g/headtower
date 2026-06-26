/** Schematic skeleton while the machines readout streams in. */
export default function MachinesLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-2">
        <div className="h-3 w-16 rounded bg-surface-2" />
        <div className="h-6 w-40 rounded bg-surface-2" />
        <div className="h-3 w-72 rounded bg-surface-2" />
      </div>

      <div className="flex items-center justify-between">
        <div className="h-3 w-40 rounded bg-surface-2" />
        <div className="h-8 w-56 rounded-control bg-surface-2" />
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="border-b border-line bg-surface-2/40 px-4 py-2.5">
          <div className="h-3 w-24 rounded bg-surface-2" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-line px-4 py-3.5 last:border-0"
          >
            <div className="h-2 w-2 shrink-0 rounded-full bg-surface-2" />
            <div className="h-3.5 w-40 rounded bg-surface-2" />
            <div className="ml-auto h-3.5 w-28 rounded bg-surface-2" />
            <div className="h-3.5 w-20 rounded bg-surface-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
