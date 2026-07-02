/**
 * Personal appearance preferences - shared constants + isomorphic helpers.
 *
 * Extends the console's theme system (`@/lib/theme`) with two more per-browser,
 * cookie-persisted preferences introduced by this page: which hue the single
 * beacon accent resolves to, and the base text size. Same shape as
 * `@/lib/theme`: a persisted cookie, pure normalize helpers safe to run on the
 * server (seeding the form's first render from the saved cookie), and
 * DOM-applying functions the client form calls on selection.
 *
 * No top-level access to `window`/`document`: `AccountPage` (a Server
 * Component) imports the cookie names and normalize helpers, so this file must
 * be safe to evaluate on the server. The DOM helpers only touch `document` when
 * called, which `AppearanceForm` does exclusively on the client.
 *
 * Known gap vs. `@/lib/theme`: there is no root-layout no-flash script for
 * these two (out of this page's scope), so a saved preference only re-applies
 * once this page has mounted - see `AppearanceForm`'s doc comment.
 */

/** Cookies carrying the two preferences, alongside `@/lib/theme`'s `ht_theme`. */
export const ACCENT_COOKIE = "ht_accent";
export const FONT_SIZE_COOKIE = "ht_font_size";

/** Persist for a year, same as the theme cookie - a non-secret UI preference. */
export const APPEARANCE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** One selectable accent hue: the four beacon shades Tailwind's utilities reference. */
export interface AccentPreset {
  id: string;
  label: string;
  /** Swatch shown in the picker (the 500 shade). */
  swatch: string;
  vars: { 300: string; 400: string; 500: string; 600: string };
  /**
   * Text colour for the check icon drawn on the swatch. Picked per swatch
   * (not derived from the theme) since the swatch is a fixed hex that
   * doesn't flip with `.dark` - a single hardcoded shade doesn't contrast
   * reliably across every preset's lightness.
   */
  check: string;
}

/**
 * The single beacon accent stays warm and blue-free: amber (the shipped
 * default) plus two warm-neutral-compatible variants. Selecting "amber" is a
 * no-op since it mirrors the shipped default.
 */
export const ACCENT_PRESETS: readonly AccentPreset[] = [
  {
    id: "amber",
    label: "Amber",
    swatch: "#f5b544",
    vars: { 300: "#ffd98a", 400: "#f9c45c", 500: "#f5b544", 600: "#e09b22" },
    check: "text-graphite-950",
  },
  {
    id: "ember",
    label: "Ember",
    swatch: "#f97316",
    vars: { 300: "#fdba74", 400: "#fb923c", 500: "#f97316", 600: "#ea580c" },
    check: "text-graphite-950",
  },
  {
    id: "brass",
    label: "Brass",
    swatch: "#8a6d3f",
    vars: { 300: "#c9ad74", 400: "#ab8a52", 500: "#8a6d3f", 600: "#6b5330" },
    check: "text-graphite-50",
  },
];
export const DEFAULT_ACCENT = "amber";

export function isAccentId(value: string | null | undefined): boolean {
  return ACCENT_PRESETS.some((preset) => preset.id === value);
}

/** The preference, or the default when the cookie is missing/garbage. */
export function normalizeAccent(value: string | null | undefined): string {
  return isAccentId(value) ? (value as string) : DEFAULT_ACCENT;
}

/** One selectable base text size - every rem-based control scales from it. */
export interface FontSizePreset {
  id: string;
  label: string;
  /** Root font-size in pixels. */
  px: number;
}

export const FONT_SIZE_PRESETS: readonly FontSizePreset[] = [
  { id: "sm", label: "Compact", px: 14 },
  { id: "md", label: "Default", px: 16 },
  { id: "lg", label: "Comfortable", px: 18 },
];
export const DEFAULT_FONT_SIZE = "md";

export function isFontSizeId(value: string | null | undefined): boolean {
  return FONT_SIZE_PRESETS.some((preset) => preset.id === value);
}

/** The preference, or the default when the cookie is missing/garbage. */
export function normalizeFontSize(value: string | null | undefined): string {
  return isFontSizeId(value) ? (value as string) : DEFAULT_FONT_SIZE;
}

/**
 * Apply an accent preset to the document live, by overriding the four beacon
 * shades on the root element. Tailwind's `bg-beacon-500` etc. utilities read
 * `var(--color-beacon-500)`, so this recolours every one of them at once
 * without touching `globals.css`. Client-only: relies on `document`.
 */
export function applyAccent(id: string): void {
  const preset = ACCENT_PRESETS.find((p) => p.id === id) ?? ACCENT_PRESETS[0];
  const root = document.documentElement.style;
  root.setProperty("--color-beacon-300", preset.vars[300]);
  root.setProperty("--color-beacon-400", preset.vars[400]);
  root.setProperty("--color-beacon-500", preset.vars[500]);
  root.setProperty("--color-beacon-600", preset.vars[600]);
}

/** Apply a font-size preset to the document live (the root rem base). Client-only. */
export function applyFontSize(id: string): void {
  const preset = FONT_SIZE_PRESETS.find((p) => p.id === id) ?? FONT_SIZE_PRESETS[1];
  document.documentElement.style.fontSize = `${preset.px}px`;
}

/** Write the accent cookie (client-side, via `document.cookie`). */
export function persistAccent(id: string): void {
  document.cookie = `${ACCENT_COOKIE}=${id}; path=/; max-age=${APPEARANCE_MAX_AGE_SECONDS}; samesite=lax`;
}

/** Write the font-size cookie (client-side, via `document.cookie`). */
export function persistFontSize(id: string): void {
  document.cookie = `${FONT_SIZE_COOKIE}=${id}; path=/; max-age=${APPEARANCE_MAX_AGE_SECONDS}; samesite=lax`;
}
