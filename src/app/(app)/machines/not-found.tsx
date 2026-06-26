import Link from "next/link";
import { ServerOff } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

/** Shown when a node id doesn't resolve to a machine. */
export default function MachineNotFound() {
  return (
    <div className="flex flex-col gap-6">
      <EmptyState
        icon={ServerOff}
        title="Machine not found"
        description="No machine with that id is enrolled in this control plane. It may have been deleted or never existed."
        action={
          <Link
            href="/machines"
            className="inline-flex h-9 items-center gap-2 rounded-control border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:border-ink-faint hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/50"
          >
            Back to machines
          </Link>
        }
      />
    </div>
  );
}
