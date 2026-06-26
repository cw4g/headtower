/**
 * Expiry presets for credential creation.
 *
 * Operators reach for a duration, not a calendar, so the create dialogs offer a
 * small set of presets and the Server Actions resolve them to an absolute RFC
 * 3339 instant at submit time. Kept framework-agnostic (no "use server", no
 * client hooks) so the dialog and its action share one source of truth.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** A selectable duration. `ms` of null means "no expiry". */
export interface ExpiryPreset {
  id: string;
  label: string;
  ms: number | null;
}

/** Pre-auth key durations. These keys are short-lived enrolment tokens. */
export const PRE_AUTH_KEY_PRESETS: readonly ExpiryPreset[] = [
  { id: "1h", label: "1 hour", ms: HOUR_MS },
  { id: "24h", label: "1 day", ms: DAY_MS },
  { id: "7d", label: "7 days", ms: 7 * DAY_MS },
  { id: "30d", label: "30 days", ms: 30 * DAY_MS },
  { id: "90d", label: "90 days", ms: 90 * DAY_MS },
  { id: "never", label: "No expiry", ms: null },
];

export const PRE_AUTH_KEY_DEFAULT = "24h";

/** API key durations. Headscale assigns no default, so an expiry is required. */
export const API_KEY_PRESETS: readonly ExpiryPreset[] = [
  { id: "7d", label: "7 days", ms: 7 * DAY_MS },
  { id: "30d", label: "30 days", ms: 30 * DAY_MS },
  { id: "90d", label: "90 days", ms: 90 * DAY_MS },
  { id: "180d", label: "180 days", ms: 180 * DAY_MS },
  { id: "1y", label: "1 year", ms: 365 * DAY_MS },
];

export const API_KEY_DEFAULT = "90d";

/**
 * Resolve a preset id to an absolute RFC 3339 expiration.
 *
 * Returns `undefined` for the "no expiry" preset (the API omits the field) and
 * `null` when the id is not in `presets` (an invalid submission the caller
 * should reject).
 */
export function resolveExpiry(
  presets: readonly ExpiryPreset[],
  id: string,
  now: number = Date.now(),
): string | undefined | null {
  const preset = presets.find((p) => p.id === id);
  if (!preset) return null;
  if (preset.ms === null) return undefined;
  return new Date(now + preset.ms).toISOString();
}
