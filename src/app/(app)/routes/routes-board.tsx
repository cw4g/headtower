"use client";

import * as React from "react";
import { useTransition } from "react";
import Link from "next/link";
import {
  Antenna,
  Check,
  Network,
  RotateCcw,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { StatusDot } from "@/components/ui/status-dot";
import {
  Table,
  TableHead,
  TableBody,
  Tr,
  Th,
  Td,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { DotStatus } from "@/lib/machines";
import type { ExitStatus, RouteGroup, RouteState } from "@/lib/routes";
import { setExitApproval, setRouteApproval, type RouteActionState } from "./actions";

const STATE_META: Record<
  RouteState,
  { dot: DotStatus; label: string; title: string }
> = {
  active: {
    dot: "online",
    label: "Active",
    title: "Approved and advertised - the node is serving this route",
  },
  approved: {
    dot: "idle",
    label: "Approved",
    title: "Approved, but the node is no longer advertising it",
  },
  pending: {
    dot: "warn",
    label: "Pending",
    title: "Advertised by the node, awaiting approval",
  },
};

/** The Routes view body: one schematic card per node carrying routes. */
export function RoutesBoard({
  groups,
  canManage,
}: {
  groups: RouteGroup[];
  /** When false, rows are read-only: state is shown but no approve/revoke. */
  canManage: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <NodeRouteCard key={group.nodeId} group={group} canManage={canManage} />
      ))}
    </div>
  );
}

function NodeRouteCard({
  group,
  canManage,
}: {
  group: RouteGroup;
  canManage: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link
            href={`/machines/${group.nodeId}`}
            className="transition-colors hover:text-beacon-500"
          >
            {group.nodeName}
          </Link>
          <span className="data text-xs text-ink-faint">#{group.nodeId}</span>
        </CardTitle>
        <div className="flex items-center gap-1.5">
          {group.pendingCount > 0 && (
            <Chip variant="warn" mono>
              {group.pendingCount} pending
            </Chip>
          )}
          {group.approvedCount > 0 && (
            <Chip variant="default" mono>
              {group.approvedCount} approved
            </Chip>
          )}
        </div>
      </CardHeader>

      <Table>
        <TableHead>
          <Tr className="hover:bg-transparent">
            <Th className="pl-4">Route</Th>
            <Th>Type</Th>
            <Th>State</Th>
            <Th className="pr-4" align="right">
              Action
            </Th>
          </Tr>
        </TableHead>
        <TableBody>
          {group.exit.state && (
            <ExitRow
              nodeId={group.nodeId}
              exit={group.exit}
              canManage={canManage}
            />
          )}
          {group.subnet.map((route) => (
            <SubnetRow
              key={route.cidr}
              nodeId={group.nodeId}
              cidr={route.cidr}
              state={route.state}
              canManage={canManage}
            />
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function SubnetRow({
  nodeId,
  cidr,
  state,
  canManage,
}: {
  nodeId: string;
  cidr: string;
  state: RouteState;
  canManage: boolean;
}) {
  const pending = state === "pending";
  return (
    <RouteRow
      cidr={cidr}
      typeIcon={Network}
      typeLabel="Subnet"
      state={state}
      canManage={canManage}
      // A pending route's button approves it; any approved route's button revokes.
      run={() => setRouteApproval(nodeId, cidr, pending)}
    />
  );
}

function ExitRow({
  nodeId,
  exit,
  canManage,
}: {
  nodeId: string;
  exit: ExitStatus;
  canManage: boolean;
}) {
  // The card only renders this row when `exit.state` is set.
  const state = exit.state as RouteState;
  const pending = state === "pending";
  return (
    <RouteRow
      cidr={exit.cidrs.join(" · ")}
      typeIcon={Antenna}
      typeLabel="Exit"
      state={state}
      canManage={canManage}
      run={() => setExitApproval(nodeId, pending)}
    />
  );
}

function RouteRow({
  cidr,
  typeIcon: TypeIcon,
  typeLabel,
  state,
  canManage,
  run,
}: {
  cidr: string;
  typeIcon: LucideIcon;
  typeLabel: string;
  state: RouteState;
  canManage: boolean;
  run: () => Promise<RouteActionState>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const meta = STATE_META[state];
  const approve = state === "pending";

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await run();
      if (result.status === "error") {
        setError(result.error ?? "Couldn't update the route.");
      }
    });
  }

  return (
    <>
      <Tr
        className={cn(
          // Routes awaiting a decision carry a faint warn wash so the operator's
          // eye lands on what still needs action.
          state === "pending" && "bg-warn-500/[0.05]",
          error && "border-0 hover:bg-transparent",
        )}
      >
        <Td className="pl-4" data>
          {cidr}
        </Td>
        <Td>
          <span className="inline-flex items-center gap-1.5 rounded-[0.3rem] border border-line bg-surface-2 px-1.5 py-0.5 text-xs text-ink-muted">
            <TypeIcon className="h-3 w-3 text-ink-faint" aria-hidden />
            {typeLabel}
          </span>
        </Td>
        <Td>
          <span
            className="inline-flex items-center gap-1.5"
            title={meta.title}
          >
            <StatusDot status={meta.dot} />
            <span className="text-xs text-ink-muted">{meta.label}</span>
          </span>
        </Td>
        <Td className="pr-4" align="right">
          {canManage ? (
            <Button
              size="sm"
              variant={approve ? "outline" : "ghost"}
              onClick={onClick}
              disabled={pending}
              className={cn(!approve && "text-ink-muted hover:text-warn-500")}
            >
              {approve ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              )}
              {pending
                ? approve
                  ? "Approving…"
                  : "Revoking…"
                : approve
                  ? "Approve"
                  : "Revoke"}
            </Button>
          ) : (
            <span className="text-xs text-ink-faint">—</span>
          )}
        </Td>
      </Tr>
      {error && (
        <Tr className="hover:bg-transparent">
          <Td colSpan={4} className="px-4 pb-2.5 pt-0">
            <span className="inline-flex items-center gap-1.5 text-xs text-critical-500">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {error}
            </span>
          </Td>
        </Tr>
      )}
    </>
  );
}
