import Link from "next/link";
import { UserX } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

/** Shown when a user id doesn't resolve to a tailnet user. */
export default function UserNotFound() {
  return (
    <div className="flex flex-col gap-6">
      <EmptyState
        icon={UserX}
        title="User not found"
        description="No user with that id exists in this control plane. It may have been deleted or never existed."
        action={
          <Link
            href="/users"
            className="inline-flex h-9 items-center gap-2 rounded-control border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:border-ink-faint hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/50"
          >
            Back to users
          </Link>
        }
      />
    </div>
  );
}
