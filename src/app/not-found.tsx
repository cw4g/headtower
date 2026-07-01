import Link from "next/link";
import { BeaconMark } from "@/components/beacon-mark";

/**
 * Global 404. Renders inside the root layout (so theme + fonts apply) but
 * outside the console chrome, since an unmatched address has no segment to host
 * it. A self-contained, on-brand "no signal" panel back to the core readout.
 */
export default function NotFound() {
  return (
    <div className="grid-field flex min-h-screen flex-col items-center justify-center gap-7 bg-canvas px-4 text-center">
      <Link href="/machines" className="flex items-center gap-2.5">
        <BeaconMark className="h-9 w-9" />
        <span className="text-[15px] font-semibold tracking-tight text-ink">
          head<span className="text-ink-muted">tower</span>
        </span>
      </Link>

      <div className="flex flex-col items-center gap-2">
        <span className="data text-[11px] uppercase tracking-[0.18em] text-beacon-500">
          404 · off the grid
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          No signal at this address
        </h1>
        <p className="max-w-sm text-sm text-ink-muted">
          This view isn&apos;t part of the console. Head back to the machines
          readout to pick the trail back up.
        </p>
      </div>

      <Link
        href="/machines"
        className="inline-flex h-9 items-center gap-2 rounded-control border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:border-ink-faint hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      >
        Open machines
      </Link>
    </div>
  );
}
