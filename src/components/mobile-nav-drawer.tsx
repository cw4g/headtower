"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { BeaconMark } from "@/components/beacon-mark";
import type { Account } from "@/components/account-menu";
import { COMMAND_EVENT } from "@/components/console-sidebar";
import { SidebarFooter } from "@/components/sidebar-footer";
import type { Theme } from "@/lib/theme";
import { NAV, isNavActive } from "@/lib/sidebar";
import { cn } from "@/lib/cn";

/**
 * Touch-reachable primary nav for below `md`. `ConsoleSidebar` collapses to a
 * 64px icon rail there with tooltips for the labels - tooltips need hover, so
 * on a touch screen those labels never appear. This is the alternative: a
 * hamburger trigger (mounted in `AppShell`'s mobile header bar) that opens a
 * left slide-over with the same {@link NAV} rows, full label and all.
 *
 * Built on Radix Dialog (like the rest of the console's overlays), so focus
 * trap, Escape-to-close, and overlay-click dismiss all come for free. Entrance
 * is a plain CSS transition flipped on the next frame after mount - no
 * animation library - and the app-wide `prefers-reduced-motion` rule in
 * globals.css already collapses every transition/animation duration for
 * operators who've asked for less motion, so no extra branching is needed
 * here for that.
 *
 * Below the scrolling nav it pins the same `SidebarFooter` the desktop rail uses
 * (search + theme, account, version), so the touch layout is not missing those
 * controls. The account/version props are threaded from `AppShell`, matching
 * what `ConsoleSidebar` already receives.
 */
export function MobileNavDrawer({
  account,
  theme,
  appVersion,
  updateAvailable = false,
  latestVersion,
}: {
  account?: Account | null;
  theme?: Theme;
  appVersion?: string;
  updateAvailable?: boolean;
  latestVersion?: string | null;
}) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = React.useState(false);
  const [entered, setEntered] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => {
      cancelAnimationFrame(frame);
      setEntered(false);
    };
  }, [open]);

  // The footer's search closes the drawer, then opens the palette via the same
  // window event the desktop trigger dispatches (the palette listens app-wide).
  const openCommand = React.useCallback(() => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent(COMMAND_EVENT));
  }, []);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Open navigation menu"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-line-strong bg-surface-2 text-ink-muted transition-colors hover:border-ink-faint hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40"
        >
          <Menu className="h-4 w-4" aria-hidden />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-graphite-950/70 backdrop-blur-[2px] transition-opacity duration-200 ease-out",
            entered ? "opacity-100" : "opacity-0",
          )}
        />
        <DialogPrimitive.Content
          aria-label="Navigation"
          className={cn(
            "grid-field fixed inset-y-0 left-0 z-50 flex h-full w-[min(78vw,280px)] flex-col border-r border-line-strong bg-surface shadow-2xl shadow-graphite-950/50 transition-transform duration-200 ease-out focus:outline-none",
            entered ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            Navigation
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Jump to a section of the console.
          </DialogPrimitive.Description>

          <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
            <span className="flex items-center gap-2.5">
              <BeaconMark className="h-6 w-6 shrink-0" />
              <span className="text-[17px] font-semibold tracking-tight text-ink">
                head<span className="text-ink-muted">tower</span>
              </span>
            </span>
            <DialogPrimitive.Close
              aria-label="Close navigation menu"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/50"
            >
              <X className="h-4 w-4" aria-hidden />
            </DialogPrimitive.Close>
          </div>

          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
            {NAV.map((item) => {
              const active = isNavActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <DialogPrimitive.Close key={item.href} asChild>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-3 rounded-control px-3 py-2.5 text-sm transition-colors",
                      active
                        ? "bg-surface-2 text-beacon-500"
                        : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    {active && (
                      <span
                        className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-beacon-500"
                        aria-hidden
                      />
                    )}
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </DialogPrimitive.Close>
              );
            })}
          </nav>

          <SidebarFooter
            account={account}
            theme={theme}
            appVersion={appVersion}
            updateAvailable={updateAvailable}
            latestVersion={latestVersion}
           
            onOpenCommand={openCommand}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
