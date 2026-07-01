"use client";

import * as React from "react";
import { RotateCw, ServerCrash } from "lucide-react";
import { BeaconMark } from "@/components/beacon-mark";
import "./globals.css";

/**
 * Top-level error boundary. When the root layout itself fails there is no chrome
 * to fall back into, so this owns the whole document: it ships its own
 * `<html>`/`<body>` with the dark theme and an inline canvas colour as a floor
 * (in case the stylesheet never loaded), then offers a single retry.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body
        // Inline floor so the page is legible even if globals.css didn't load.
        style={{ background: "#0e1117", color: "#e6edf3" }}
      >
        <div className="grid-field flex min-h-screen flex-col items-center justify-center gap-7 px-4 text-center">
          <div className="flex items-center gap-2.5">
            <BeaconMark className="h-9 w-9" />
            <span className="text-[15px] font-semibold tracking-tight text-ink">
              head<span className="text-ink-muted">tower</span>
            </span>
          </div>

          <span className="flex h-12 w-12 items-center justify-center rounded-card border border-critical-500/30 bg-critical-500/10 text-critical-500">
            <ServerCrash className="h-6 w-6" aria-hidden />
          </span>

          <div className="flex flex-col items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-ink">
              The console hit a fault
            </h1>
            <p className="max-w-sm text-sm text-ink-muted">
              Something failed before the operator console could render. Reload to
              try again; if it persists, check the Headtower server logs.
            </p>
            {error.digest && (
              <p className="data mt-1 text-[11px] text-ink-faint">
                ref {error.digest}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={reset}
            className="inline-flex h-9 items-center gap-2 rounded-control border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:border-ink-faint hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/50"
          >
            <RotateCw className="h-4 w-4" aria-hidden />
            Reload console
          </button>
        </div>
      </body>
    </html>
  );
}
