"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Globe,
  LayoutDashboard,
  Menu,
  Route,
  ScrollText,
  Search,
  Server,
  Settings,
  Shield,
  Users,
  type LucideIcon,
} from "lucide-react";
import { BeaconMark } from "@/components/beacon-mark";
import { Kbd } from "@/components/ui/kbd";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

/** Primary console nav. The palette can later jump to any of these. */
const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Machines", href: "/machines", icon: Server },
  { label: "Users", href: "/users", icon: Users },
  { label: "Access", href: "/access", icon: Shield },
  { label: "Routes", href: "/routes", icon: Route },
  { label: "DNS", href: "/dns", icon: Globe },
  { label: "Audit", href: "/audit", icon: ScrollText },
  { label: "Settings", href: "/settings", icon: Settings },
];

/** Mono build tag shown in the top bar. */
export const APP_VERSION = "v0.1.0";

/** Custom event the (future) command palette listens for. */
export const COMMAND_EVENT = "headtower:command";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function ConsoleTopBar() {
  const pathname = usePathname() ?? "";

  const openCommand = React.useCallback(() => {
    window.dispatchEvent(new CustomEvent(COMMAND_EVENT));
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
    <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="grid-field">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4">
          {/* Brand: beacon mark in its housing + wordmark. */}
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-control border border-line bg-graphite-900">
              <BeaconMark className="h-5 w-5 text-graphite-300" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-ink">
              head<span className="text-ink-muted">tower</span>
            </span>
          </Link>

          <span className="hidden h-5 w-px bg-line lg:block" aria-hidden />

          {/* Schematic nav: muted links, beacon underline marks the active one. */}
          <nav className="hidden items-center gap-0.5 lg:flex">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-sm transition-colors",
                    active
                      ? "text-ink"
                      : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {item.label}
                  {active && (
                    <span
                      className="absolute inset-x-2.5 -bottom-px h-0.5 rounded-full bg-beacon-500"
                      aria-hidden
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right cluster: command trigger, version, mobile nav. */}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={openCommand}
              className="group flex h-8 items-center gap-2 rounded-control border border-line-strong bg-surface-2 pl-2 pr-1.5 text-sm text-ink-faint transition-colors hover:border-ink-faint hover:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40"
            >
              <Search className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Search or jump</span>
              <Kbd className="ml-1">⌘K</Kbd>
            </button>

            <span className="data hidden text-xs text-ink-faint sm:inline">
              {APP_VERSION}
            </span>

            <div className="lg:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Open navigation"
                    className="flex h-8 w-8 items-center justify-center rounded-control border border-line-strong bg-surface-2 text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40"
                  >
                    <Menu className="h-4 w-4" aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48">
                  {NAV.map((item) => {
                    const active = isActive(pathname, item.href);
                    const Icon = item.icon;
                    return (
                      <DropdownMenuItem key={item.href} asChild>
                        <Link
                          href={item.href}
                          className={cn(active && "text-ink")}
                        >
                          <Icon className="h-4 w-4 text-ink-faint" aria-hidden />
                          {item.label}
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
