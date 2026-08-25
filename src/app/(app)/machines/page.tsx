import { cookies } from "next/headers";
import { Server } from "lucide-react";
import {
  nodes as nodesApi,
  users as usersApi,
  policy as policyApi,
} from "@/lib/headscale";
import { parsePolicy } from "@/lib/policy";
import { getAgentPeers, sshBridgeAvailable } from "@/lib/agent";
import { withoutAgentNodes } from "@/lib/agent-node";
import { sessionCan } from "@/lib/authz";
import { getConfig } from "@/lib/config";
import { getNodeMetadataMap, type NodeMetadataValue } from "@/lib/db";
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
} from "@/components/machines/add-device-dialog-lazy";
import { AddDeviceDeepLink } from "@/components/machines/add-device-deep-link";

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
  // Terminal quick-links only make sense when the agent's SSH bridge exists at
  // all; a row cannot ask for that itself (client component, config read).
  const sshAvailable = sshBridgeAvailable();
  // The dialog's "use existing key" mode builds its command box up front (no
  // server round trip), so it needs the login-server URL before the operator
  // ever submits anything, not just after `createDeviceKey` returns one.
  const loginServerUrl = getConfig().headscale?.loginServerUrl ?? "";
  // Tag suggestions for the Edit tags dialog: every tag already in use across
  // the tailnet, plus the tagOwners keys declared in the ACL policy.
  const knownTags = error ? [] : await collectKnownTags(views);
  // Headtower-local per-node metadata (note / environment / labels), surfaced as
  // quiet chips on the rows. Read only for the machines actually shown, and
  // best-effort so an unavailable store never blocks the list.
  const nodeMetadata = error ? {} : await collectNodeMetadata(views);

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

      {/* Enrolment deep-link handler: opens the Add device dialog from the
          `?add=1` / `?register=<key>` flags the command palette emits, then
          strips the flag from the URL. Only mounts the (lazy) dialog on demand. */}
      {canAddDevice && (
        <AddDeviceDeepLink users={userOptions} loginServerUrl={loginServerUrl} />
      )}

      {error ? (
        <ConnectionError error={error} />
      ) : views && views.length > 0 ? (
        view === "cards" ? (
          <MachinesCards
            nodes={views}
            nowMs={now}
            canManage={canManage}
            sshAvailable={sshAvailable}
            knownTags={knownTags}
            metadata={nodeMetadata}
          />
        ) : (
          <MachinesTable
            nodes={views}
            canManage={canManage}
            sshAvailable={sshAvailable}
            knownTags={knownTags}
            metadata={nodeMetadata}
          />
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

/**
 * Gather the tag suggestions offered in the Edit tags dialog: every tag already
 * applied to a machine, unioned with the `tagOwners` keys declared in the ACL
 * policy. The policy read is best-effort - it only succeeds in database policy
 * mode, so any failure (file mode, unreachable control plane) quietly falls back
 * to the in-use tags alone. Result is sorted for a stable, scannable order.
 */
async function collectKnownTags(views: NodeView[] | null): Promise<string[]> {
  const tags = new Set<string>();
  for (const view of views ?? []) {
    for (const tag of view.tags) tags.add(tag);
  }
  try {
    const doc = await policyApi.get();
    const { model } = parsePolicy(doc.policy);
    for (const owner of model.tagOwners) {
      if (owner.name.startsWith("tag:")) tags.add(owner.name);
    }
  } catch {
    // Best-effort; in-use tags are enough on their own.
  }
  return [...tags].sort();
}

/**
 * Resolve Headtower-local metadata for the shown machines as a plain
 * `nodeId -> value` record (serialisable straight to the client rows). Only
 * annotated nodes appear, so a row cheaply checks `metadata[node.id]`.
 * Best-effort: an unavailable local store yields an empty record.
 */
async function collectNodeMetadata(
  views: NodeView[] | null,
): Promise<Record<string, NodeMetadataValue>> {
  if (!views || views.length === 0) return {};
  try {
    const map = await getNodeMetadataMap(views.map((v) => v.id));
    const out: Record<string, NodeMetadataValue> = {};
    for (const [id, value] of map) out[id] = value;
    return out;
  } catch {
    return {};
  }
}
