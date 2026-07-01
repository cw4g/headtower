"use client";

/**
 * AgentWidget - the Headtower agent sidecar's live health readout plus an
 * on/off toggle. The health facts (reachable, status, latency, or the reason
 * it isn't) are read on the server via `getAgentHealth()` and handed down as
 * plain props; toggling calls the `setAgentEnabled` Server Action, which
 * re-validates the dashboard so this widget picks up the fresh state once the
 * config write lands.
 *
 * This is a client leaf for exactly one reason: the toggle needs to call a
 * Server Action from a click handler. Everything else here is a server-computed
 * readout, same contract as `DeviceBreakdown` / `ExpiringSoon` / `RecentActivity`.
 */
import * as React from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/cn";
import type { AgentHealth } from "@/lib/agent";
import { setAgentEnabled } from "@/app/(app)/dashboard/actions";

export interface AgentWidgetProps {
  health: AgentHealth;
  /** Whether an agent URL is configured at all - the toggle needs one to flip. */
  configured: boolean;
  enabled: boolean;
  /** Whether this session holds settings.write; otherwise the toggle is read-only. */
  canWrite: boolean;
}

export function AgentWidget({ health, configured, enabled, canWrite }: AgentWidgetProps) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await setAgentEnabled(!enabled);
      if (result.status === "error") setError(result.error);
    });
  }

  const detail = health.reachable
    ? [health.service, health.status].filter(Boolean).join(" · ") ||
      "The agent answered its health check."
    : (health.error ?? "The agent is unreachable.");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <StatusDot status={health.reachable ? "online" : "critical"} pulse />
          <span className="text-sm font-medium text-ink">
            {health.reachable ? "Reachable" : "Unreachable"}
          </span>
          {health.latencyMs != null && (
            <span className="data text-xs text-ink-faint">{health.latencyMs}ms</span>
          )}
        </div>

        {configured &&
          (canWrite ? (
            <AgentToggle enabled={enabled} pending={pending} onToggle={toggle} />
          ) : (
            <Chip variant={enabled ? "online" : "default"} mono>
              {enabled ? "on" : "off"}
            </Chip>
          ))}
      </div>

      <p className="text-xs text-ink-muted">{detail}</p>

      {configured && !canWrite && (
        <p className="text-xs text-ink-faint">
          Toggling this needs the <span className="data text-ink-muted">settings.write</span>{" "}
          capability.
        </p>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-critical-500">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

function AgentToggle({
  enabled,
  pending,
  onToggle,
}: {
  enabled: boolean;
  pending: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? "Turn the agent off" : "Turn the agent on"}
      disabled={pending}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        "disabled:cursor-default disabled:opacity-60",
        enabled ? "border-online-500/50 bg-online-500/20" : "border-line-strong bg-surface-2",
      )}
    >
      {pending ? (
        <Loader2 className="mx-auto h-3 w-3 animate-spin text-ink-faint" aria-hidden />
      ) : (
        <span
          className={cn(
            "inline-block h-3.5 w-3.5 transform rounded-full transition-transform",
            enabled ? "translate-x-4 bg-online-500" : "translate-x-1 bg-ink-faint",
          )}
        />
      )}
    </button>
  );
}
