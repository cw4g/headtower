"use client";

import dynamic from "next/dynamic";
import { LaptopMinimal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AddDeviceDialogProps } from "./add-device-dialog";

export type { UserOption, AddDeviceDialogProps } from "./add-device-dialog";

/**
 * Trigger-shaped placeholder shown while the real dialog chunk loads, so the
 * button is in place from first paint with no layout shift. Mirrors the
 * dialog's own default trigger.
 */
function TriggerFallback() {
  return (
    <Button variant="solid" size="sm" disabled>
      <LaptopMinimal className="h-4 w-4" aria-hidden />
      Add device
    </Button>
  );
}

/**
 * Lazily-loaded Add device dialog. The dialog is ~800 lines and pulls in the
 * `qrcode` package, yet defaults closed and is only opened on demand - so it is
 * loaded via `next/dynamic` with `ssr: false` to keep it (and qrcode) out of
 * the route's initial client bundle. The heavy chunk is fetched right after
 * hydration, swapping the placeholder trigger for the interactive dialog.
 *
 * `ssr: false` requires a Client Component boundary (it is not allowed in a
 * Server Component), which is why this wrapper exists rather than calling
 * `dynamic` directly in the machines page.
 */
export const AddDeviceDialog = dynamic<AddDeviceDialogProps>(
  () => import("./add-device-dialog").then((m) => m.AddDeviceDialog),
  { ssr: false, loading: () => <TriggerFallback /> },
);
