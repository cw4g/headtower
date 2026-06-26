/**
 * Theme system - shared constants + isomorphic helpers.
 *
 * The console is dark-first, but the full light theme is already defined in
 * globals.css (`:root` = light, `.dark` = dark). This module owns the small
 * contract that ties three pieces together:
 *
 *   - the persisted preference (a `system | light | dark` cookie),
 *   - the no-flash inline script the root layout runs before first paint,
 *   - the client toggle that flips the `dark` class live.
 *
 * No top-level access to `window`/`document`: the layout (a Server Component)
 * imports {@link THEME_COOKIE} and {@link themeInitScript}, so this file must be
 * safe to evaluate on the server. The DOM helpers below only touch the document
 * when called, which the toggle does exclusively on the client.
 */

/** Cookie carrying the operator's theme preference. */
export const THEME_COOKIE = "ht_theme";

/** The three selectable preferences. `system` defers to the OS. */
export const THEME_VALUES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEME_VALUES)[number];

/** A control console belongs in low light, so dark is the default. */
export const DEFAULT_THEME: Theme = "dark";

/** Persist the preference for a year; it is a non-secret UI cookie. */
export const THEME_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Narrow an untrusted string (cookie value) to a {@link Theme}. */
export function isTheme(value: string | null | undefined): value is Theme {
  return value === "system" || value === "light" || value === "dark";
}

/** The preference, or the default when the cookie is missing/garbage. */
export function normalizeTheme(value: string | null | undefined): Theme {
  return isTheme(value) ? value : DEFAULT_THEME;
}

/**
 * Resolve a preference to a concrete dark/light boolean. `system` consults the
 * OS via `matchMedia`. Client-only: relies on `window`.
 */
export function resolvesToDark(theme: Theme): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Apply a preference to the document live: flip the `dark` class and the native
 * `color-scheme` so form controls and scrollbars track the theme. Client-only.
 */
export function applyTheme(theme: Theme): void {
  const dark = resolvesToDark(theme);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

/** Write the preference cookie (client-side, via `document.cookie`). */
export function persistTheme(theme: Theme): void {
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${THEME_MAX_AGE_SECONDS}; samesite=lax`;
}

/**
 * The inline no-flash script, as a string for `dangerouslySetInnerHTML`. It runs
 * synchronously while the browser parses `<head>`, so the resolved `dark` class
 * is in place before the first paint - reading the same cookie and honouring
 * `prefers-color-scheme` for `system`, exactly as {@link applyTheme} does at
 * runtime. Wrapped in try/catch so a locked-down `document.cookie` can't break
 * rendering; it simply falls back to the default.
 */
export function themeInitScript(): string {
  return (
    `(function(){try{` +
    `var d=${JSON.stringify(DEFAULT_THEME)};` +
    `var m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=([^;]*)/);` +
    `var p=m?decodeURIComponent(m[1]):d;` +
    `if(p!=="light"&&p!=="dark"&&p!=="system")p=d;` +
    `var dark=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);` +
    `var e=document.documentElement;` +
    `e.classList.toggle("dark",dark);` +
    `e.style.colorScheme=dark?"dark":"light";` +
    `}catch(e){}})();`
  );
}
