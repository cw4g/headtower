/**
 * Node metadata - shared value shapes, limits, and pure helpers.
 *
 * This module is deliberately DEPENDENCY-FREE (no `node:sqlite`, no server
 * imports) so it can be imported from BOTH the server (the DB helper in
 * `./node-metadata`, the Server Actions) AND the browser (the edit dialog, the
 * list rows). Keeping the constants and normalisers here means the client can
 * enforce the same limits it renders while the server stays the authority.
 *
 * The metadata itself - an operator note, a deployment environment, and free
 * labels - is Headtower-local: it lives in Headtower's own SQLite and is NEVER
 * pushed to Headscale. See `./schema` (`node_metadata`) for the table.
 */

/** Deployment environments an operator can tag a node with. `null` = unset. */
export type NodeEnvironment = "prod" | "staging" | "dev";

/** One selectable environment, with its label and Chip variant for badges. */
export interface EnvironmentMeta {
  value: NodeEnvironment;
  /** Short human label shown on the badge and in the select. */
  label: string;
  /** Chip variant used to render the environment badge on-brand. */
  chip: "beacon" | "warn" | "default";
}

/**
 * The fixed environment set, in operator reading order (most→least sensitive).
 * `prod` carries the scarce beacon accent; `staging` warns; `dev` stays neutral.
 */
export const ENVIRONMENTS: readonly EnvironmentMeta[] = [
  { value: "prod", label: "Production", chip: "beacon" },
  { value: "staging", label: "Staging", chip: "warn" },
  { value: "dev", label: "Development", chip: "default" },
] as const;

/** Max length of the free-form note, enforced on read-in and on write. */
export const NOTE_MAX_LENGTH = 2000;
/** Max number of labels kept on a node. */
export const LABEL_MAX_COUNT = 16;
/** Max length of a single label. */
export const LABEL_MAX_LENGTH = 32;

/** The resolved, UI-facing metadata for one node. Absent fields are empty. */
export interface NodeMetadataValue {
  note: string | null;
  environment: NodeEnvironment | null;
  labels: string[];
  /** Epoch ms of the last write, when the row exists. */
  updatedAt: number | null;
}

/** An empty metadata value - the shape a node with no row resolves to. */
export const EMPTY_NODE_METADATA: NodeMetadataValue = {
  note: null,
  environment: null,
  labels: [],
  updatedAt: null,
};

/** Whether a value carries any operator content worth rendering. */
export function hasMetadata(value: NodeMetadataValue): boolean {
  return (
    (value.note != null && value.note.trim() !== "") ||
    value.environment != null ||
    value.labels.length > 0
  );
}

/** Look up an environment's metadata (label + chip variant), or null when unset. */
export function environmentMeta(
  environment: NodeEnvironment | null | undefined,
): EnvironmentMeta | null {
  if (!environment) return null;
  return ENVIRONMENTS.find((e) => e.value === environment) ?? null;
}

/** Coerce arbitrary input to a known environment, or null when unrecognised. */
export function normalizeEnvironment(
  input: unknown,
): NodeEnvironment | null {
  return ENVIRONMENTS.some((e) => e.value === input)
    ? (input as NodeEnvironment)
    : null;
}

/** Trim a note, collapse an empty result to null, and cap its length. */
export function normalizeNote(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;
  return trimmed.slice(0, NOTE_MAX_LENGTH);
}

/**
 * Normalise a label list the way both the dialog preview and the write path do:
 * trim each entry, cap it to {@link LABEL_MAX_LENGTH}, drop blanks, dedupe while
 * preserving order, and keep at most {@link LABEL_MAX_COUNT}.
 */
export function normalizeLabels(input: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const label = raw.trim().slice(0, LABEL_MAX_LENGTH);
    if (label === "" || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
    if (out.length >= LABEL_MAX_COUNT) break;
  }
  return out;
}

/**
 * Deterministic per-label accent colour for chips. The design system is
 * monochrome with a single beacon accent, so the chip body stays neutral; this
 * tints only a small leading dot, giving each label a stable, scannable hue
 * (the Headplane label pattern) WITHOUT repainting the UI. Blue is excluded to
 * respect the palette, and the greens/reds of the status scale are steered
 * clear of so a label never reads as a status.
 *
 * Returns a CSS `hsl(...)` string for an inline `style`, since these hues are
 * intentionally outside the Tailwind token set.
 */
export function labelColor(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  // Draw the hue from three warm arcs only (amber, magenta, rose), skipping the
  // cool/blue band entirely, so each label reads as a stable, distinct hue that
  // is never blue and never mistakable for a status colour.
  const pick = hash % 120;
  let hue: number;
  if (pick < 40) hue = 20 + pick; // amber / orange
  else if (pick < 80) hue = 300 + (pick - 40); // magenta
  else hue = (340 + (pick - 80)) % 360; // rose / red
  return `hsl(${hue} 55% 55%)`;
}
