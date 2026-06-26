/**
 * Turn a thrown Headscale client error into a short, operator-facing message.
 *
 * Plain (non-"use server") module so the machine Server Actions can surface a
 * concise reason inline without leaking the verbose internal error string
 * (URL + status) into the UI. The page itself renders the richer
 * `ConnectionError` panel; this is the one-line form for action failures.
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
