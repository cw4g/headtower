"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, Rows3 } from "lucide-react";
import { SegmentedTabs, type SegmentedOption } from "@/components/ui/segmented";
import { persistMachineView, type MachineViewMode } from "@/lib/machines";

const OPTIONS: SegmentedOption<MachineViewMode>[] = [
  { value: "table", label: "Table", icon: Rows3 },
  { value: "cards", label: "Cards", icon: LayoutGrid },
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
    <SegmentedTabs
      options={OPTIONS}
      value={optimistic}
      onValueChange={select}
      ariaLabel="Machines view"
      className={pending ? "opacity-70 transition-opacity" : "transition-opacity"}
    />
  );
}
