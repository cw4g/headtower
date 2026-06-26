"use client";

import * as React from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectionError } from "@/components/machines/connection-error";

/**
 * Shared client error boundary for the console's route segments. Renders the
 * on-brand diagnostic panel - which classifies Headscale faults and falls back
 * to a plain readout for anything else - over a Retry that re-runs the segment.
 *
 * Each segment's `error.tsx` is a thin wrapper around this so every view fails
 * the same way machines does.
 */
export function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Surface to the server console / monitoring.
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col gap-4">
      <ConnectionError error={error} />
      <div>
        <Button variant="outline" onClick={reset}>
          <RotateCw className="h-4 w-4" aria-hidden />
          Retry
        </Button>
      </div>
    </div>
  );
}
