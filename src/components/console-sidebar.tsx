"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BeaconMark } from "@/components/beacon-mark";
import type { Account } from "@/components/account-menu";
import { SidebarFooter } from "@/components/sidebar-footer";
import { Tooltip } from "@/components/ui/tooltip";
import type { Theme } from "@/lib/theme";
import { NAV, isNavActive, persistSidebarCollapsed, type NavItem } from "@/lib/sidebar";
import { cn } from "@/lib/cn";

/** Custom event the command palette listens for. */
export const COMMAND_EVENT = "headtower:command";

/**
 * The operator-console left rail. A collapsible sidebar: the beacon logo at the
 * top doubles as the collapse toggle (persisted to a cookie so the server shell
 * can render the right width on first paint), a vertical nav in the middle with
 * a beacon accent on the active view, and the account / theme / command controls
 * pinned to the footer. Collapsed it becomes a 64px icon rail with tooltips;
 * below `md` it is hidden entirely - small screens use the mobile header +
 * drawer (see `AppShell`/`MobileNavDrawer`) instead.
 */
export function ConsoleSidebar({
  account,
  theme,
  initialCollapsed = false,
  appVersion,
  updateAvailable = false,
  latestVersion,
}: {
  account?: Account | null;
  theme?: Theme;
  initialCollapsed?: boolean;
  /** The running build's version (from package.json), for the footer tag. */
  appVersion?: string;
  /** Whether a newer commit is published than what's running (see @/lib/version). */
  updateAvailable?: boolean;
  /** The newer version's label, when {@link updateAvailable}. */
  latestVersion?: string | null;
}) {
  const pathname = usePathname() ?? "";
  const [collapsed, setCollapsed] = React.useState(initialCollapsed);

  const openCommand = React.useCallback(() => {
    window.dispatchEvent(new CustomEvent(COMMAND_EVENT));
  }, []);

  const toggle = React.useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      persistSidebarCollapsed(next);
      return next;
    });
  }, []);

  // Cmd/Ctrl-K opens the command palette from anywhere in the console.
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCommand();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCommand]);

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "grid-field z-40 hidden h-full shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 ease-out md:flex",
        // Below md the rail is hidden entirely - small screens use the mobile
        // header + drawer instead; at md and up it honours the collapse state
        // (icon rail or full column).
        collapsed ? "w-16" : "w-16 md:w-[220px]",
      )}
    >
      {/* Top: the beacon logo doubles as the collapse toggle. */}
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-line",
          collapsed ? "justify-center px-0" : "justify-center px-0 md:px-3",
        )}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="flex items-center gap-2.5 rounded-control p-1 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40"
        >
          <BeaconMark className="h-7 w-7 shrink-0" />
          {!collapsed && (
            <span className="hidden text-[19px] font-semibold tracking-tight text-ink md:inline">
              head<span className="text-ink-muted">tower</span>
            </span>
          )}
        </button>
      </div>

      {/* Nav: muted rows, a beacon left-bar + text marks the active view. */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {NAV.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isNavActive(pathname, item.href)}
            collapsed={collapsed}
          />
        ))}
      </nav>

      {/* Footer: shared command/theme/account/version block. Icon rail when
          collapsed; the drawer renders the same component (see SidebarFooter). */}
      <SidebarFooter
        account={account}
        theme={theme}
        appVersion={appVersion}
        updateAvailable={updateAvailable}
        latestVersion={latestVersion}
        collapsed={collapsed}
        onOpenCommand={openCommand}
      />
    </aside>
  );
}

/** A single nav row. Collapsed it is an icon with a tooltip. */
function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;

  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center rounded-control py-2 text-sm transition-colors",
        collapsed
          ? "justify-center px-0"
          : "justify-center px-0 md:justify-start md:gap-3 md:px-3",
        active
          ? "text-beacon-500"
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
      <span className={cn("truncate", collapsed ? "hidden" : "hidden md:inline")}>
        {item.label}
      </span>
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip content={item.label} side="right">
        {link}
      </Tooltip>
    );
  }
  return link;
}
