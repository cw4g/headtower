import { cookies } from "next/headers";
import { Server } from "lucide-react";
import { nodes as nodesApi } from "@/lib/headscale";
import { getAgentPeers } from "@/lib/agent";
import { withoutAgentNodes } from "@/lib/agent-node";
import {
  toNodeView,
  nowMs,
  normalizeMachineView,
  MACHINES_VIEW_COOKIE,
  type NodeView,
} from "@/lib/machines";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { MachinesTable } from "@/components/machines/machines-table";
import { MachinesCards } from "@/components/machines/machines-cards";
import { MachinesViewToggle } from "@/components/machines/machines-view-toggle";
import { ConnectionError } from "@/components/machines/connection-error";

// The console reports live tailnet state; never prebuild this view.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Machines",
};

export default async function MachinesPage() {
  // One request clock, read once, and threaded into the derived views (and the
  // card reachability hint) so server render and client hydration agree.
  const now = nowMs();
  const view = normalizeMachineView(
    (await cookies()).get(MACHINES_VIEW_COOKIE)?.value,
  );

  let views: NodeView[] | null = null;
  let error: unknown = null;

  try {
    // Agent enrichment is best-effort and fails quiet, so fetch it alongside the
    // node list; an absent sidecar just yields an empty index.
    const [rawList, agents] = await Promise.all([
      nodesApi.list(),
      getAgentPeers(),
    ]);
    // The agent's own tailnet node is infrastructure, not a device — hide it.
    const list = withoutAgentNodes(rawList);
    views = list
      .map((node) =>
        toNodeView(node, now, agents.lookup(node.name, node.ipAddresses ?? [])),
      )
      .sort((a, b) => {
        // Online first, then by name — the operator's reading order.
        if (a.online !== b.online) return a.online ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  } catch (err) {
    error = err;
  }

  const hasMachines = views != null && views.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        eyebrow="Tailnet"
        title="Machines"
        description="Every device enrolled in the control plane and its live signal."
      >
        {hasMachines && <MachinesViewToggle view={view} />}
      </SectionHeading>

      {error ? (
        <ConnectionError error={error} />
      ) : views && views.length > 0 ? (
        view === "cards" ? (
          <MachinesCards nodes={views} nowMs={now} />
        ) : (
          <MachinesTable nodes={views} />
        )
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
