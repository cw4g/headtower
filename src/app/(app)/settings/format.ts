/**
 * Small, pure timestamp formatters shared by the Settings readouts.
 *
 * Plain module (no "use server"): imported by Server Components only. Dates are
 * rendered as schematic UTC (YYYY-MM-DD) so columns line up like an instrument.
 */

const DAY_MS = 86_400_000;

/**
 * Request-time clock. Wrapped here (rather than calling `Date.now()` inline in a
 * Server Component) so the value is read once per request without tripping the
 * render-purity lint, which can't tell a server render from a client one.
 */
export function nowMs(): number {
  return Date.now();
}

/** Render a timestamp as a UTC date (YYYY-MM-DD) plus a full ISO title. */
export function formatDate(ts: string | null): { label: string; title: string } | null {
  if (!ts) return null;
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return null;
  return { label: date.toISOString().slice(0, 10), title: date.toISOString() };
}

/** Lifecycle state of an expiry-bearing credential, for status chips. */
export type ExpiryState = "never" | "active" | "expiring" | "expired";

export interface ExpiryView {
  state: ExpiryState;
  /** Short label for the cell (a UTC date, "Never", or "Expired"). */
  label: string;
  /** Full ISO timestamp for a title attribute, or null when there is none. */
  title: string | null;
}

/**
 * Classify an expiry timestamp relative to `now`. A key within a day of its
 * expiry is flagged "expiring" so the operator can rotate it before it lapses.
 */
export function describeExpiry(ts: string | null, now: number = Date.now()): ExpiryView {
  if (!ts) return { state: "never", label: "Never", title: null };
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return { state: "never", label: "·", title: null };

  const title = date.toISOString();
  const diff = date.getTime() - now;
  if (diff <= 0) return { state: "expired", label: "Expired", title };

  const label = date.toISOString().slice(0, 10);
  if (diff <= DAY_MS) return { state: "expiring", label, title };
  return { state: "active", label, title };
}
