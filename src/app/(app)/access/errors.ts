/**
 * Turn a thrown Headscale client error into a short, operator-facing message
 * for the Access view.
 *
 * Plain (non-"use server") module so it can be shared by the Access server
 * component and the save-policy Server Action without leaking the verbose
 * internal error string (URL + status) into the UI. When Headscale rejects a
 * policy document it returns a precise reason (often with a line number) in the
 * body; we surface that verbatim so the operator can fix the HuJSON.
 */

import {
  HeadscaleConfigError,
  HeadscaleError,
  HeadscaleRequestError,
} from "@/lib/headscale";

export function describeHeadscaleError(err: unknown): string {
  if (err instanceof HeadscaleConfigError) {
    return "Headscale isn't configured yet. Set HEADSCALE_URL and HEADSCALE_API_KEY, then reload.";
  }
  if (err instanceof HeadscaleRequestError) {
    const detail = parseDetail(err.body);
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

/** Pull a human message out of a gRPC-gateway error body, if there is one. */
function parseDetail(body: string): string | undefined {
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
