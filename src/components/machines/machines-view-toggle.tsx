"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, Rows3, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { persistMachineView, type MachineViewMode } from "@/lib/machines";

const OPTIONS: { id: MachineViewMode; label: string; Icon: LucideIcon }[] = [
  { id: "table", label: "Table", Icon: Rows3 },
  { id: "cards", label: "Cards", Icon: LayoutGrid },
];

/**
 * The Table | Cards switch. The choice is a sticky preference: we write it to a
 * cookie and ask the server to re-render (the page reads the cookie and picks
 * the view), so it survives reloads and later visits. `useOptimistic` flips the
 * highlight the instant it is clicked, then reverts to the server's echoed
 * `view` once the refresh transition settles.
 */
export function MachinesViewToggle({ view }: { view: MachineViewMode }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [optimistic, setOptimistic] = React.useOptimistic(view);

  function select(next: MachineViewMode) {
    if (next === optimistic) return;
    persistMachineView(next);
    startTransition(() => {
      setOptimistic(next);
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded-control border border-line bg-surface-2 p-0.5 transition-opacity",
        pending && "opacity-70",
      )}
      role="tablist"
      aria-label="Machines view"
    >
      {OPTIONS.map(({ id, label, Icon }) => {
        const isActive = optimistic === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => select(id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[0.4rem] px-2.5 py-1 text-xs font-medium transition-colors",
              isActive
                ? "bg-surface text-ink shadow-sm"
                : "text-ink-muted hover:text-ink",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
