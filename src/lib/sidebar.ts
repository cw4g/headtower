/**
 * Sidebar collapse state - shared constant + isomorphic helpers.
 *
 * The console sidebar can be collapsed to an icon rail. That choice is a sticky
 * UI preference: the client toggle writes it to a cookie, and the server app
 * shell reads the same cookie so the very first render matches the persisted
 * state (no expand/collapse flash on load).
 *
 * No top-level `document` access: the shell (a Server Component) imports
 * {@link SIDEBAR_COOKIE} and {@link normalizeSidebarCollapsed}, so this file must
 * be safe to evaluate on the server. {@link persistSidebarCollapsed} only touches
 * `document.cookie` when called, which the toggle does exclusively on the client.
 */

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
