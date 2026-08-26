/**
 * Pure types + helpers for the policy revision history.
 *
 * Split from `./policy-revisions` for the same reason `./node-metadata-types` is
 * split from `./node-metadata`: this half imports nothing from Node or SQLite,
 * so a client component may import it and a unit test can exercise the state
 * logic without opening a database file.
 */

/** How a stored revision relates to what the control plane is serving. */
export type PolicyRevisionState = "live" | "deployed" | "draft";

/** A revision as handed to the UI: no document body, just what a row shows. */
export interface PolicyRevisionView {
  id: number;
  /** Epoch-ms, so the value survives the server/client boundary. */
  createdAt: number;
  actor: string;
  /** Display name for `actor` when it resolves to an account, else null. */
  actorName: string | null;
  note: string | null;
  digest: string;
  /** Length of the document in bytes. */
  bytes: number;
  /** Epoch-ms of the last push to Headscale, or null for a draft. */
  lastDeployedAt: number | null;
  state: PolicyRevisionState;
}

export const NOTE_MAX_LENGTH = 120;

/**
 * Classify a revision against the document Headscale currently serves.
 *
 * "live" is derived, never stored. A flag would keep asserting control that had
 * been lost: change the policy with the Headscale CLI and every row here is
 * suddenly historical, which is exactly what an operator needs to see. When
 * `liveDigest` matches nothing, no row is live - and that absence is the signal.
 *
 * Note that "live" does not require `lastDeployedAt`: the baseline captured from
 * the control plane on first load was never pushed *from here*, yet it is
 * plainly what is running.
 */
export function revisionState(
  revision: { digest: string; lastDeployedAt: Date | number | null },
  liveDigest: string | null,
): PolicyRevisionState {
  if (liveDigest !== null && revision.digest === liveDigest) return "live";
  return revision.lastDeployedAt != null ? "deployed" : "draft";
}

/** Chip copy and tone for a state, so the list and the diff header agree. */
export function stateMeta(state: PolicyRevisionState): {
  label: string;
  tone: "online" | "default" | "beacon";
  hint: string;
} {
  switch (state) {
    case "live":
      return {
        label: "live",
        tone: "online",
        hint: "This is the document the control plane is serving right now.",
      };
    case "deployed":
      return {
        label: "was live",
        tone: "default",
        hint: "Pushed to the control plane before, superseded since.",
      };
    default:
      return {
        label: "draft",
        tone: "beacon",
        hint: "Saved here only; never pushed to the control plane.",
      };
  }
}

/** Trim a note to something a row can render, or null when it is blank. */
export function normalizeNote(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, NOTE_MAX_LENGTH);
}
