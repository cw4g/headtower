"use server";

/**
 * Diagnostics self-check (Server Action).
 *
 * Runs on demand from the Diagnostics view. A single authenticated probe against
 * the admin API is classified into three honest pass/fail signals:
 *
 *   - reachability  - did the control plane answer at all? (a 401 still counts)
 *   - authorization - was the configured API key accepted? (no 401/403)
 *   - version       - did the v1 admin API return its expected envelope?
 *
 * The result is returned to the caller; the client persists the last run per
 * session. Nothing is stored on the server, so there is no shared global state.
 */

import {
  apiKeys,
  HeadscaleNetworkError,
  HeadscaleParseError,
  HeadscaleRequestError,
  HeadscaleTimeoutError,
} from "@/lib/headscale";
import { getConfig } from "@/lib/config";

export type CheckStatus = "pass" | "fail" | "skip";

export interface DiagnosticCheck {
  id: "reachability" | "version" | "authorization";
  label: string;
  status: CheckStatus;
  /** One-line outcome, safe to show (never includes the API key). */
  detail: string;
  /** Optional remediation hint shown under a non-pass row. */
  hint?: string;
}

export interface DiagnosticsReport {
  /** ISO timestamp of when the probe ran. */
  ranAt: string;
  /** The control-plane host probed, or null when unconfigured. */
  target: string | null;
  checks: DiagnosticCheck[];
}

const SUPPORTED_RANGE = "Headscale 0.26 - 0.29";

export async function runDiagnostics(): Promise<DiagnosticsReport> {
  const ranAt = new Date().toISOString();

  // Configuration gate: without a URL + key there is nothing to reach.
  const config = getConfig();
  if (!config.headscale) {
    return {
      ranAt,
      target: null,
      checks: [
        {
          id: "reachability",
          label: "Control plane reachable",
          status: "fail",
          detail: "Headscale is not configured.",
          hint: "Connect Headscale in setup, or set HEADSCALE_URL and HEADSCALE_API_KEY, then run the check again.",
        },
        skipped("version", "Server API version", "Waiting on a reachable control plane."),
        skipped(
          "authorization",
          "API key authorized",
          "Waiting on a reachable control plane.",
        ),
      ],
    };
  }
  const target: string = hostOf(config.headscale.url);

  // One authenticated probe powers all three signals.
  try {
    const list = await apiKeys.list();
    return {
      ranAt,
      target,
      checks: [
        {
          id: "reachability",
          label: "Control plane reachable",
          status: "pass",
          detail: `Connected to ${target}.`,
        },
        {
          id: "version",
          label: "Server API version",
          status: "pass",
          detail: `Admin API v1 responded as expected (${SUPPORTED_RANGE} compatible).`,
          hint: "Headscale's admin API exposes no version string; Headtower verifies the v1 contract instead.",
        },
        {
          id: "authorization",
          label: "API key authorized",
          status: "pass",
          detail: `Key accepted. ${list.length} ${
            list.length === 1 ? "key" : "keys"
          } visible.`,
        },
      ],
    };
  } catch (err) {
    return { ranAt, target, checks: classifyFailure(err, target) };
  }
}

/** Map a probe failure onto the three rows, attributing it to the right stage. */
function classifyFailure(err: unknown, target: string): DiagnosticCheck[] {
  if (err instanceof HeadscaleTimeoutError) {
    return [
      {
        id: "reachability",
        label: "Control plane reachable",
        status: "fail",
        detail: `No response from ${target} within the timeout.`,
        hint: "Confirm the control plane is running and reachable from this host.",
      },
      skipped("version", "Server API version", "Couldn't reach the control plane."),
      skipped("authorization", "API key authorized", "Couldn't reach the control plane."),
    ];
  }

  if (err instanceof HeadscaleNetworkError) {
    return [
      {
        id: "reachability",
        label: "Control plane reachable",
        status: "fail",
        detail: `Couldn't open a connection to ${target}.`,
        hint: "Check HEADSCALE_URL is correct and resolvable, and that TLS is valid for https.",
      },
      skipped("version", "Server API version", "Couldn't reach the control plane."),
      skipped("authorization", "API key authorized", "Couldn't reach the control plane."),
    ];
  }

  if (err instanceof HeadscaleRequestError) {
    const reached: DiagnosticCheck = {
      id: "reachability",
      label: "Control plane reachable",
      status: "pass",
      detail: `${target} answered (HTTP ${err.status}).`,
    };

    if (err.status === 401 || err.status === 403) {
      return [
        reached,
        skipped("version", "Server API version", "Needs an authorized key to read."),
        {
          id: "authorization",
          label: "API key authorized",
          status: "fail",
          detail: `Headscale rejected the key (HTTP ${err.status}).`,
          hint: "The key may be expired or lack permissions. Mint a fresh one with `headscale apikeys create`.",
        },
      ];
    }

    // Reached and got past auth, but the API errored - flag it as a version /
    // compatibility problem rather than an auth one.
    return [
      reached,
      {
        id: "version",
        label: "Server API version",
        status: "fail",
        detail: `Admin API returned HTTP ${err.status}.`,
        hint: `Confirm the server is in the supported range (${SUPPORTED_RANGE}); check its logs for this request.`,
      },
      skipped(
        "authorization",
        "API key authorized",
        "Couldn't confirm; the API responded with an error.",
      ),
    ];
  }

  if (err instanceof HeadscaleParseError) {
    return [
      {
        id: "reachability",
        label: "Control plane reachable",
        status: "pass",
        detail: `${target} answered.`,
      },
      {
        id: "version",
        label: "Server API version",
        status: "fail",
        detail: "The admin API returned an unparseable response.",
        hint: `This host may not be a Headscale admin API in the supported range (${SUPPORTED_RANGE}).`,
      },
      skipped(
        "authorization",
        "API key authorized",
        "Couldn't confirm; the response wasn't understood.",
      ),
    ];
  }

  return [
    {
      id: "reachability",
      label: "Control plane reachable",
      status: "fail",
      detail: err instanceof Error ? err.message : String(err),
      hint: "An unexpected error occurred while probing the control plane.",
    },
    skipped("version", "Server API version", "Self-check did not complete."),
    skipped("authorization", "API key authorized", "Self-check did not complete."),
  ];
}

function skipped(
  id: DiagnosticCheck["id"],
  label: string,
  hint: string,
): DiagnosticCheck {
  return { id, label, status: "skip", detail: "Not checked.", hint };
}

/** Host (and port) of a URL, for display. Falls back to the raw string. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
