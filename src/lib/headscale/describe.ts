/**
 * Shared Headscale error classifier - a PURE module (no server-only deps).
 *
 * One home for turning a thrown Headscale client error into operator-facing
 * copy. It imports the error classes from their PURE module (./errors), never
 * the request core (./client) or the barrel (both reach config + `node:sqlite`),
 * so this stays client-importable: an error boundary or panel can classify a
 * failure without dragging the server layers into the browser bundle.
 *
 * Two variants:
 *   - {@link describeHeadscaleError}: a single line for inline Server Action
 *     failures - a concise reason without the verbose internal string.
 *   - {@link describeHeadscaleErrorDetailed}: a structured {icon, title, detail,
 *     hints} for the full diagnostic panel (see ConnectionError).
 *
 * Both drew from copies that had drifted across the app; this is the reconciled
 * superset (e.g. the 401/403 "rejected the API key" hint now fires everywhere).
 */

import type { LucideIcon } from "lucide-react";
import { KeyRound, PlugZap, ServerCrash, TimerOff } from "lucide-react";
import {
  HeadscaleConfigError,
  HeadscaleError,
  HeadscaleNetworkError,
  HeadscaleRequestError,
  HeadscaleTimeoutError,
} from "./errors";

/** Turn a thrown Headscale client error into a short, operator-facing message. */
export function describeHeadscaleError(err: unknown): string {
  if (err instanceof HeadscaleConfigError) {
    return "Headscale isn't configured yet. Set HEADSCALE_URL and HEADSCALE_API_KEY, then reload.";
  }
  if (err instanceof HeadscaleRequestError) {
    const detail = parseHeadscaleDetail(err.body);
    if (detail) return capitalize(detail);
    if (err.status === 401 || err.status === 403) {
      return "Headscale rejected the API key. Generate a fresh one with `headscale apikeys create`.";
    }
    return `Headscale responded with ${err.status} ${err.statusText}.`;
  }
  if (err instanceof HeadscaleError) {
    // Timeout / network / parse: the control plane is unreachable or misbehaving.
    return "Couldn't reach Headscale. Check that the control plane is running and reachable.";
  }
  return "An unexpected error occurred.";
}

/** Structured classification for the full diagnostic panel. */
export interface DescribedHeadscaleError {
  icon: LucideIcon;
  title: string;
  detail: string;
  hints: string[];
}

/**
 * Classify a thrown Headscale error into an icon, headline, detail line, and a
 * few remediation hints - the richer form rendered by the ConnectionError panel.
 */
export function describeHeadscaleErrorDetailed(
  error: unknown,
): DescribedHeadscaleError {
  if (error instanceof HeadscaleConfigError) {
    return {
      icon: PlugZap,
      title: "Headscale isn't configured",
      detail: error.message,
      hints: [
        "Connect Headscale from the in-app setup wizard at /setup",
        "Or set HEADSCALE_URL and HEADSCALE_API_KEY in the environment",
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

/** Pull a human message out of a gRPC-gateway error body, if there is one. */
export function parseHeadscaleDetail(body: string): string | undefined {
  if (!body) return undefined;
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const message =
        typeof obj.message === "string"
          ? obj.message
          : typeof obj.error === "string"
            ? obj.error
            : undefined;
      if (message && message.trim()) return message.trim();
    }
  } catch {
    // Not JSON; fall through to the raw text.
  }
  const trimmed = body.trim();
  return trimmed ? trimmed.slice(0, 200) : undefined;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
