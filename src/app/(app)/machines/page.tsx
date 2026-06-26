import { Server } from "lucide-react";
import { nodes as nodesApi } from "@/lib/headscale";
import { toNodeView, nowMs } from "@/lib/machines";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { MachinesTable } from "@/components/machines/machines-table";
import { ConnectionError } from "@/components/machines/connection-error";

// The console reports live tailnet state; never prebuild this view.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Machines",
};

export default async function MachinesPage() {
  let views: ReturnType<typeof toNodeView>[] | null = null;
  let error: unknown = null;

  try {
    const now = nowMs();
    const list = await nodesApi.list();
    views = list
      .map((node) => toNodeView(node, now))
      .sort((a, b) => {
        // Online first, then by name — the operator's reading order.
        if (a.online !== b.online) return a.online ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  } catch (err) {
    error = err;
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        eyebrow="Tailnet"
        title="Machines"
        description="Every device enrolled in the control plane and its live signal."
      />

      {error ? (
        <ConnectionError error={error} />
      ) : views && views.length > 0 ? (
        <MachinesTable nodes={views} />
      ) : (
        <EmptyState
          icon={Server}
          title="No machines enrolled"
          description="Once a device registers with this control plane it appears here. Enrol one with a pre-auth key or the Headscale CLI."
        />
      )}
    </div>
  );
}
