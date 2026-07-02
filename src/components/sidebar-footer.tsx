"use client";

import { ArrowUpCircle, Search } from "lucide-react";
import { AccountMenu, type Account } from "@/components/account-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Tooltip } from "@/components/ui/tooltip";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/cn";

/** Where the update-available affordances point. */
const CHANGELOG_URL = "https://headtower.niheshr.com/changelog";

/**
 * The shared console footer: the command trigger + theme switcher on one row, a
 * full-width account card, and a centred version line (with the update-available
 * affordance when a newer build is published). Rendered both in the desktop
 * `ConsoleSidebar` (which also drives the collapsed icon-rail variant) and pinned
 * to the bottom of the `MobileNavDrawer`.
 *
 * `onOpenCommand` keeps the footer event-agnostic: the sidebar just dispatches
 * the command event, while the drawer closes itself first (see each caller).
 */
export function SidebarFooter({
  account,
  theme,
  appVersion,
  updateAvailable = false,
  latestVersion,
  collapsed = false,
  onOpenCommand,
}: {
  account?: Account | null;
  theme?: Theme;
  /** The running build's version (from package.json), for the footer tag. */
  appVersion?: string;
  /** Whether a newer commit is published than what's running (see @/lib/version). */
  updateAvailable?: boolean;
  /** The newer version's label, when {@link updateAvailable}. */
  latestVersion?: string | null;
  /** Icon-rail layout. Only the collapsed desktop sidebar sets this. */
  collapsed?: boolean;
  /** Open the command palette (the caller decides how; see component doc). */
  onOpenCommand: () => void;
}) {
  // Collapsed icon rail: keep today's vertical stack of compact affordances.
  if (collapsed) {
    return (
      <div className="flex shrink-0 flex-col gap-2 border-t border-line p-2">
        <CommandTrigger collapsed onOpen={onOpenCommand} />
        <ThemeToggle initialTheme={theme} collapsed />
        {account && <AccountMenu account={account} collapsed />}
        {updateAvailable && (
          <Tooltip
            content={
              latestVersion ? `Update available - v${latestVersion}` : "Update available"
            }
            side="right"
          >
            <a
              href={CHANGELOG_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center rounded-control p-1.5 text-beacon-500 transition-colors hover:bg-surface-2"
              aria-label="Update available"
            >
              <ArrowUpCircle className="h-4 w-4" aria-hidden />
            </a>
          </Tooltip>
        )}
      </div>
    );
  }

  // Full column (expanded sidebar) or the mobile drawer: search + theme share a
  // row, the account card spans full width, the version sits centred below.
  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-line p-2">
      <div className="flex items-center gap-1.5">
        <CommandTrigger onOpen={onOpenCommand} className="min-w-0 flex-1" />
        <ThemeToggle initialTheme={theme} cycle />
      </div>

      {account && <AccountMenu account={account} />}

      <div className="flex flex-col items-center gap-1">
        {updateAvailable && (
          <a
            href={CHANGELOG_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-control border border-beacon-500/30 bg-beacon-500/10 px-2 py-1 text-[10px] font-medium text-beacon-500 transition-colors hover:bg-beacon-500/15"
          >
            <ArrowUpCircle className="h-3 w-3 shrink-0" aria-hidden />
            Update available
            {latestVersion && <span className="data">v{latestVersion}</span>}
          </a>
        )}
        <span className="data text-[10px] text-ink-faint">v{appVersion}</span>
      </div>
    </div>
  );
}

/**
 * The command-palette trigger: a full search field when expanded, a tooltip'd
 * icon when collapsed. No ⌘K chip - the palette itself teaches the shortcut,
 * and the chip would crowd the shared search+theme row.
 */
function CommandTrigger({
  collapsed = false,
  onOpen,
  className,
}: {
  collapsed?: boolean;
  onOpen: () => void;
  className?: string;
}) {
  const button = (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Search or jump to a section"
      className={cn(
        "group flex h-9 items-center rounded-control border border-line-strong bg-surface-2 text-ink-faint transition-colors hover:border-ink-faint hover:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40",
        collapsed ? "justify-center px-0" : "justify-start gap-2 px-2.5",
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0" aria-hidden />
      {!collapsed && (
        <span className="flex-1 truncate text-left text-sm">Search or jump</span>
      )}
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
