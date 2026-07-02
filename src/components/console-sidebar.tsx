"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpCircle, Search } from "lucide-react";
import { BeaconMark } from "@/components/beacon-mark";
import { AccountMenu, type Account } from "@/components/account-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Kbd } from "@/components/ui/kbd";
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

      {/* Footer: command trigger, theme toggle, account. Icons when collapsed. */}
      <div className="flex shrink-0 flex-col gap-2 border-t border-line p-2">
        <CommandTrigger collapsed={collapsed} onOpen={openCommand} />

        <ThemeToggle initialTheme={theme} collapsed={collapsed} />

        {account && <AccountMenu account={account} collapsed={collapsed} />}

        {updateAvailable && collapsed && (
          <Tooltip
            content={
              latestVersion ? `Update available - v${latestVersion}` : "Update available"
            }
            side="right"
          >
            <a
              href="https://headtower.niheshr.com/changelog"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center rounded-control p-1.5 text-beacon-500 transition-colors hover:bg-surface-2"
              aria-label="Update available"
            >
              <ArrowUpCircle className="h-4 w-4" aria-hidden />
            </a>
          </Tooltip>
        )}

        {!collapsed && (
          <div className="hidden md:flex md:flex-col md:gap-1 md:px-1">
            {updateAvailable && (
              <a
                href="https://headtower.niheshr.com/changelog"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-control border border-beacon-500/30 bg-beacon-500/10 px-2 py-1 text-[10px] font-medium text-beacon-500 transition-colors hover:bg-beacon-500/15"
              >
                <ArrowUpCircle className="h-3 w-3 shrink-0" aria-hidden />
                Update available
                {latestVersion && <span className="data">v{latestVersion}</span>}
              </a>
            )}
            <span className="data text-[10px] text-ink-faint">
              v{appVersion}
            </span>
          </div>
        )}
      </div>
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

/** The Cmd-K trigger: full search field when open, an icon when collapsed. */
function CommandTrigger({
  collapsed,
  onOpen,
}: {
  collapsed: boolean;
  onOpen: () => void;
}) {
  const button = (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Search or jump to a section"
      className={cn(
        "group flex h-9 items-center rounded-control border border-line-strong bg-surface-2 text-ink-faint transition-colors hover:border-ink-faint hover:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40",
        collapsed
          ? "justify-center px-0"
          : "justify-center px-0 md:justify-start md:gap-2 md:px-2.5",
      )}
    >
      <Search className="h-4 w-4 shrink-0" aria-hidden />
      <span
        className={cn(
          "flex-1 text-left text-sm",
          collapsed ? "hidden" : "hidden md:inline",
        )}
      >
        Search or jump
      </span>
      <Kbd className={cn(collapsed ? "hidden" : "hidden md:inline-flex")}>
        ⌘K
      </Kbd>
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip content="Search or jump  ⌘K" side="right">
        {button}
      </Tooltip>
    );
  }
  return button;
}
