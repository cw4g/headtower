import * as React from "react";
import { PlugZap, KeyRound, ServerCrash, TimerOff } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  HeadscaleConfigError,
  HeadscaleNetworkError,
  HeadscaleTimeoutError,
  HeadscaleRequestError,
} from "@/lib/headscale";
import { ConfigError } from "@/lib/config";

interface Described {
  icon: LucideIcon;
  title: string;
  detail: string;
  hints: string[];
}

function describe(error: unknown): Described {
  if (error instanceof ConfigError || error instanceof HeadscaleConfigError) {
    return {
      icon: PlugZap,
      title: "Headscale isn't configured",
      detail: error.message,
      hints: [
        "Set HEADSCALE_URL to your control plane, e.g. https://headscale.example.com",
        "Set HEADSCALE_API_KEY from `headscale apikeys create`",
      ],
    };
  }
  if (error instanceof HeadscaleTimeoutError) {
    return {
      icon: TimerOff,
      title: "Headscale timed out",
      detail: error.message,
      hints: [
        "Confirm the control plane is running and reachable from this host",
        "Check for a firewall or proxy between Headtower and Headscale",
      ],
    };
  }
  if (error instanceof HeadscaleNetworkError) {
    return {
      icon: ServerCrash,
      title: "Can't reach Headscale",
      detail: error.message,
      hints: [
        "Verify HEADSCALE_URL is correct and resolvable",
        "Confirm TLS is valid if you're using https",
      ],
    };
  }
  if (error instanceof HeadscaleRequestError) {
    const auth = error.status === 401 || error.status === 403;
    return {
      icon: auth ? KeyRound : ServerCrash,
      title: auth
        ? "Headscale rejected the API key"
        : `Headscale returned ${error.status}`,
      detail: error.message,
      hints: auth
        ? [
            "The API key may be expired or lack permissions",
            "Generate a fresh key with `headscale apikeys create`",
          ]
        : ["Inspect the Headscale server logs for the failing request"],
    };
  }
  return {
    icon: ServerCrash,
    title: "Something went wrong",
    detail: error instanceof Error ? error.message : String(error),
    hints: [],
  };
}

/** An on-brand, diagnostic panel for any failure talking to Headscale. */
export function ConnectionError({ error }: { error: unknown }) {
  const { icon: Icon, title, detail, hints } = describe(error);

  return (
    <div className="grid-field rounded-card border border-critical-500/30 bg-surface">
      <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:gap-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card border border-critical-500/30 bg-critical-500/10 text-critical-500">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-ink">{title}</p>
            <p className="data max-w-2xl break-words text-xs text-ink-muted">
              {detail}
            </p>
          </div>
          {hints.length > 0 && (
            <ul className="flex flex-col gap-1">
              {hints.map((hint) => (
                <li
                  key={hint}
                  className="flex items-start gap-2 text-xs text-ink-faint"
                >
                  <span
                    className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-faint"
                    aria-hidden
                  />
                  {hint}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
