import * as React from "react";
import { ConsoleTopBar } from "@/components/console-top-bar";

/**
 * The operator-console chrome: the schematic top bar over a grid-field canvas,
 * with the routed view rendered into the centred content column. Server
 * component — only the top bar (nav + command trigger) is interactive.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <ConsoleTopBar />
      <main className="relative flex-1">
        <div
          className="grid-field pointer-events-none absolute inset-0"
          aria-hidden
        />
        <div className="relative mx-auto w-full max-w-[1400px] px-4 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
