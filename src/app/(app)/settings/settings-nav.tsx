"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, KeyRound, KeySquare, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

interface SettingsNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
}

const ITEMS: SettingsNavItem[] = [
  {
    label: "Pre-auth keys",
    href: "/settings/pre-auth-keys",
    icon: KeyRound,
    description: "Enrolment tokens",
  },
  {
    label: "API keys",
    href: "/settings/api-keys",
    icon: KeySquare,
    description: "Admin access",
  },
  {
    label: "Diagnostics",
    href: "/settings/diagnostics",
    icon: Activity,
    description: "Connection self-check",
  },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Schematic settings sidebar: a hairline rail of segments. The active segment
 * carries the single beacon marker (a left tick), everything else stays quiet.
 * Collapses to a horizontal scroller on narrow viewports.
 */
export function SettingsNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="Settings sections"
      className="flex shrink-0 gap-1 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-visible"
    >
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-control border px-3 py-2 text-sm transition-colors",
              active
                ? "border-line-strong bg-surface text-ink"
                : "border-transparent text-ink-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            {active && (
              <span
                className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-beacon-500"
                aria-hidden
              />
            )}
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                active ? "text-beacon-500" : "text-ink-faint",
              )}
              aria-hidden
            />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-medium">{item.label}</span>
              <span className="hidden truncate text-xs text-ink-faint lg:block">
                {item.description}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
