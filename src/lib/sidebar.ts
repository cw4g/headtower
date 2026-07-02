/**
 * Sidebar collapse state - shared constant + isomorphic helpers.
 *
 * The console sidebar can be collapsed to an icon rail. That choice is a sticky
 * UI preference: the client toggle writes it to a cookie, and the server app
 * shell reads the same cookie so the very first render matches the persisted
 * state (no expand/collapse flash on load).
 *
 * Also the single source of truth for the primary nav list ({@link NAV}): both
 * `ConsoleSidebar` (the desktop/collapsed icon rail) and `MobileNavDrawer` (the
 * touch-reachable full-label drawer below `md`) render the same rows from here,
 * so adding a section only means editing one array.
 *
 * No top-level `document` access: the shell (a Server Component) imports
 * {@link SIDEBAR_COOKIE} and {@link normalizeSidebarCollapsed}, so this file must
 * be safe to evaluate on the server. {@link persistSidebarCollapsed} only touches
 * `document.cookie` when called, which the toggle does exclusively on the client.
 */

import type { LucideIcon } from "lucide-react";
import {
  Globe,
  LayoutDashboard,
  Route,
  ScrollText,
  Server,
  Settings,
  Shield,
  Users,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

/** Primary console nav - shared by the desktop icon rail and the mobile drawer. */
export const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Machines", href: "/machines", icon: Server },
  { label: "Users", href: "/users", icon: Users },
  { label: "Access", href: "/access", icon: Shield },
  { label: "Routes", href: "/routes", icon: Route },
  { label: "DNS", href: "/dns", icon: Globe },
  { label: "Audit", href: "/audit", icon: ScrollText },
  { label: "Settings", href: "/settings", icon: Settings },
];

/** True when `pathname` is `href` or a descendant of it - the shared "active nav row" rule. */
export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/** Cookie carrying the operator's sidebar collapse preference. */
export const SIDEBAR_COOKIE = "ht_sidebar";

/** Persist the preference for a year; a non-secret UI cookie. */
export const SIDEBAR_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Narrow an untrusted cookie value to the collapsed flag ("1" = collapsed). */
export function normalizeSidebarCollapsed(
  value: string | null | undefined,
): boolean {
  return value === "1";
}

/** Persist the collapse preference (client-side, via `document.cookie`). */
export function persistSidebarCollapsed(collapsed: boolean): void {
  document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? "1" : "0"}; path=/; max-age=${SIDEBAR_MAX_AGE_SECONDS}; samesite=lax`;
}
