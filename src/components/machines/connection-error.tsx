import * as React from "react";
// Import the error classes and classifier from their PURE modules, not the
// barrels: the Headscale barrel and config index reach the request/DB layers
// (node:sqlite), and this component is pulled into the client bundle by the
// route error boundary.
import { HeadscaleConfigError } from "@/lib/headscale/errors";
import {
  describeHeadscaleErrorDetailed,
  type DescribedHeadscaleError,
} from "@/lib/headscale/describe";
import { ConfigError } from "@/lib/config/types";

function describe(error: unknown): DescribedHeadscaleError {
  // A config-layer failure renders identically to a Headscale config error;
  // route it through the shared classifier so the copy stays in one place.
  if (error instanceof ConfigError) {
    return describeHeadscaleErrorDetailed(
      new HeadscaleConfigError(error.message),
    );
  }
  return describeHeadscaleErrorDetailed(error);
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
