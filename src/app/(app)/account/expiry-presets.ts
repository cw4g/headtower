/**
 * Expiry presets for personal API keys.
 *
 * Mirrors `@/app/(app)/settings/expiry-presets` (the pattern used for Headscale
 * pre-auth and API keys): a small, framework-agnostic module - no "use server",
 * no client hooks - so the create dialog and the create Server Action share one
 * source of truth. Kept local to `account/` rather than importing the settings
 * one: personal API keys are a distinct, optional-expiry concept from
 * Headscale's own (mandatory-expiry) API keys, and this page stays out of the
 * settings tree entirely.
 */

const DAY_MS = 86_400_000;

/** A selectable duration. `ms` of null means "no expiry". */
export interface ExpiryPreset {
  id: string;
  label: string;
  ms: number | null;
}

export const PERSONAL_KEY_PRESETS: readonly ExpiryPreset[] = [
  { id: "30d", label: "30 days", ms: 30 * DAY_MS },
  { id: "90d", label: "90 days", ms: 90 * DAY_MS },
  { id: "180d", label: "180 days", ms: 180 * DAY_MS },
  { id: "1y", label: "1 year", ms: 365 * DAY_MS },
  { id: "never", label: "No expiry", ms: null },
];

/** Personal keys are optional-expiry, so the default is "never". */
export const PERSONAL_KEY_DEFAULT = "never";

/**
 * Resolve a preset id to an absolute expiry `Date`, or `null` for "no expiry".
 * Returns `undefined` when the id isn't a known preset, so the caller can
 * reject an invalid submission.
 */
export function resolvePersonalKeyExpiry(
  id: string,
  now: number = Date.now(),
): Date | null | undefined {
  const preset = PERSONAL_KEY_PRESETS.find((p) => p.id === id);
  if (!preset) return undefined;
  return preset.ms === null ? null : new Date(now + preset.ms);
}
