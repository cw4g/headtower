import { cookies } from "next/headers";
import { Server } from "lucide-react";
import { nodes as nodesApi, users as usersApi } from "@/lib/headscale";
import { getAgentPeers } from "@/lib/agent";
import { withoutAgentNodes } from "@/lib/agent-node";
import { sessionCan } from "@/lib/authz";
import { getConfig } from "@/lib/config";
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
import {
  AddDeviceDialog,
  type UserOption,
} from "@/components/machines/add-device-dialog";

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
  let userOptions: UserOption[] = [];
  let error: unknown = null;

  try {
    // Agent enrichment is best-effort and fails quiet, so fetch it alongside the
    // node list; an absent sidecar just yields an empty index. The user list
    // rides along too — it's the same connection, and it's what the Add device
    // dialog needs to offer an owner.
    const [rawList, agents, allUsers] = await Promise.all([
      nodesApi.list(),
      getAgentPeers(),
      usersApi.list(),
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
    userOptions = allUsers.map((user) => ({
      id: user.id,
      label: user.displayName?.trim() || user.name,
      handle: user.name,
    }));
  } catch (err) {
    error = err;
  }

  const hasMachines = views != null && views.length > 0;
  // Minting a pre-auth key for the Add device flow is the same capability as
  // Settings > Pre-auth keys.
  const canAddDevice = !error && (await sessionCan("keys.write"));
  // Row/card action menus (rename, tags, expire, delete) need machines.write.
  const canManage = !error && (await sessionCan("machines.write"));
  // The dialog's "use existing key" mode builds its command box up front (no
  // server round trip), so it needs the login-server URL before the operator
  // ever submits anything, not just after `createDeviceKey` returns one.
  const loginServerUrl = getConfig().headscale?.loginServerUrl ?? "";

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        eyebrow="Tailnet"
        title="Machines"
        description="Every device enrolled in the control plane and its live signal."
      >
        {hasMachines && <MachinesViewToggle view={view} />}
        {canAddDevice && (
          <AddDeviceDialog users={userOptions} loginServerUrl={loginServerUrl} />
        )}
      </SectionHeading>

      {error ? (
        <ConnectionError error={error} />
      ) : views && views.length > 0 ? (
        view === "cards" ? (
          <MachinesCards nodes={views} nowMs={now} canManage={canManage} />
        ) : (
          <MachinesTable nodes={views} canManage={canManage} />
        )
      ) : (
        <EmptyState
          icon={Server}
          title="No machines enrolled"
          description="Once a device registers with this control plane it appears here. Enrol one with a pre-auth key or the Headscale CLI."
          action={
            canAddDevice ? (
              <AddDeviceDialog users={userOptions} loginServerUrl={loginServerUrl} />
            ) : undefined
          }
        />
      )}
    </div>
  );
}
