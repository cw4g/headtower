import { Network } from "lucide-react";
import { routes as routesApi } from "@/lib/headscale";
import { groupHasRoutes, toRouteGroup, type RouteGroup } from "@/lib/routes";
import { SectionHeading } from "@/components/ui/section-heading";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ConnectionError } from "@/components/machines/connection-error";
import { RoutesBoard } from "./routes-board";

// Approvals are live control-plane state; always render against Headscale.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Routes",
};

export default async function RoutesPage() {
  let groups: RouteGroup[] | null = null;
  let error: unknown = null;

  try {
    const all = await routesApi.list();
    groups = all
      .map(toRouteGroup)
      .filter(groupHasRoutes)
      .sort((a, b) => {
        // Nodes with routes awaiting a decision rise to the top of the board.
        const aPending = a.pendingCount > 0;
        const bPending = b.pendingCount > 0;
        if (aPending !== bPending) return aPending ? -1 : 1;
        return a.nodeName.localeCompare(b.nodeName);
      });
  } catch (err) {
    error = err;
  }

  const nodeCount = groups?.length ?? 0;
  const pendingTotal = groups?.reduce((sum, g) => sum + g.pendingCount, 0) ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        eyebrow="Tailnet"
        title={
          <span className="inline-flex items-center gap-2.5">
            Routes
            {!error && nodeCount > 0 && (
              <Chip mono variant="default">
                {nodeCount}
              </Chip>
            )}
            {!error && pendingTotal > 0 && (
              <Chip mono variant="warn">
                {pendingTotal} pending
              </Chip>
            )}
          </span>
        }
        description="Subnet routes and exit nodes advertised across the tailnet. Approve a route to let the node serve it."
      />

      {error ? (
        <ConnectionError error={error} />
      ) : !groups || groups.length === 0 ? (
        <EmptyState
          icon={Network}
          title="No routes advertised"
          description="When a machine advertises a subnet route or offers to act as an exit node, it appears here for approval."
        />
      ) : (
        <RoutesBoard groups={groups} />
      )}
    </div>
  );
}
