import * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, SquareTerminal } from "lucide-react";
import { nodes as nodesApi, HeadscaleRequestError } from "@/lib/headscale";
import type { Node } from "@/lib/headscale";
import { sessionCan } from "@/lib/authz";
import { toNodeView, nowMs } from "@/lib/machines";
import { EmptyState } from "@/components/ui/empty-state";
import { ConnectionError } from "@/components/machines/connection-error";
import { TerminalConsole, DEFAULT_SSH_USER } from "@/components/terminal/terminal-console";

// Live, per-request session/authz + Headscale reads - never prerender.
export const dynamic = "force-dynamic";

/**
 * Dedicated full-page SSH terminal for a node, opened in a new tab from the
 * "Terminal" icon link on the machine detail page. Kept as its own route
 * (rather than a dialog) so a long-running shell isn't tied to the detail
 * page's lifetime and gets the whole viewport to work in.
 */
export default async function MachineTerminalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ user?: string | string[] }>;
}) {
  const [{ id }, sp, canSsh] = await Promise.all([
    params,
    searchParams,
    sessionCan("ssh.connect"),
  ]);

  if (!canSsh) {
    return (
      <EmptyState
        icon={Lock}
        title="Terminal access isn't available"
        description="Your role doesn't have the ssh.connect capability. Ask an operator to grant terminal access, or sign in with an account that has it."
        action={
          <Link
            href={`/machines/${id}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-beacon-500 transition-colors hover:text-beacon-400"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to machine
          </Link>
        }
      />
    );
  }

  let node: Node | null = null;
  let error: unknown = null;
  try {
    node = await nodesApi.get(id);
  } catch (err) {
    if (err instanceof HeadscaleRequestError && err.status === 404) {
      notFound();
    }
    error = err;
  }

  if (error) {
    return <ConnectionError error={error} />;
  }
  if (!node) {
    notFound();
  }

  const view = toNodeView(node, nowMs());
  const sshHost = view.ipv4 || view.ipv6 || view.hostname || null;
  const initialUser = firstValue(sp.user)?.trim() || DEFAULT_SSH_USER;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/machines/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          <span className="font-medium text-ink">{view.name}</span>
        </Link>
        <span className="flex items-center gap-1.5 text-xs text-ink-faint">
          <SquareTerminal className="h-3.5 w-3.5" aria-hidden />
          SSH terminal, via the Headtower agent, over the tailnet
        </span>
      </div>

      {sshHost ? (
        <TerminalConsole
          host={sshHost}
          defaultUser={initialUser}
          className="min-h-[70vh]"
        />
      ) : (
        <EmptyState
          title="No address to connect to"
          description="This node has no IPv4/IPv6 address or hostname reported yet."
        />
      )}
    </div>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
