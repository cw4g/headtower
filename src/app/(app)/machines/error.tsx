"use client";

import * as React from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectionError } from "@/components/machines/connection-error";

/** Last-resort boundary for the machines segment. */
export default function MachinesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Surface to the server console / monitoring during development.
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
