"use client";

/**
 * HistoryPanel - the saved policy revisions, and the two verbs Headscale lacks.
 *
 * Headscale's policy API is `GET`/`PUT` of one current document with no
 * versions, so this list is the only place an earlier policy exists. Each row
 * offers: compare against the editor, load into the editor (no deploy), deploy
 * to the control plane, rename, delete.
 *
 * A client leaf because every verb is a Server Action call from a click handler;
 * the rows themselves are server-computed (`PolicyRevisionView`), including the
 * live/was-live/draft state, which is derived by digest rather than stored - see
 * `@/lib/db/policy-revision-types`.
 */

import * as React from "react";
import {
  Check,
  GitCompare,
  Loader2,
  Pencil,
  Rocket,
  SquareArrowOutUpRight,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import {
  NOTE_MAX_LENGTH,
  stateMeta,
  type PolicyRevisionView,
} from "@/lib/db/policy-revision-types";
import { DiffView } from "./diff-view";
import {
  deployRevision,
  removeRevision,
  renameRevision,
  saveRevision,
  type RevisionActionState,
} from "./history-actions";

export interface HistoryPanelProps {
  revisions: PolicyRevisionView[];
  /** The current editor document — what "Save current" would store. */
  editorDocument: string;
  /**
   * The document the control plane is serving, which is what every comparison
   * is made against.
   *
   * Diffing a revision against the EDITOR was the first attempt and it answered
   * the wrong question twice over: the Review tab already compares the editor
   * against the live policy, and a half-finished edit is not a baseline anybody
   * reasons about. What an operator wants to know here is "what would change if
   * I deployed this", and that is measured against what is running.
   */
  liveDocument: string;
  /** False when the role lacks acls.write: read-only list, no verbs. */
  canWrite: boolean;
  /** Load a stored document into the editor (never deploys). */
  onLoad: (document: string) => void;
}

/** Compact absolute timestamp; the audit view is the place for relative time. */
function formatWhen(epochMs: number): string {
  return new Date(epochMs).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistoryPanel({
  revisions,
  editorDocument,
  liveDocument,
  canWrite,
  onLoad,
}: HistoryPanelProps) {
  const [pendingId, setPendingId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [comparing, setComparing] = React.useState<number | null>(null);
  const [renaming, setRenaming] = React.useState<number | null>(null);
  const [noteDraft, setNoteDraft] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState<number | null>(null);
  const [, startTransition] = React.useTransition();

  // The compared document is fetched on demand: the list deliberately carries no
  // document bodies, so a hundred revisions cost a hundred rows, not a megabyte
  // of policy text in the client bundle.
  const [comparedDocument, setComparedDocument] = React.useState<string | null>(null);

  /**
   * Run one verb and report what actually happened.
   *
   * `describe` receives the action's result rather than a fixed string, because
   * a save that found the document already stored wrote nothing - announcing
   * "Saved" there would be exactly the kind of control that reports success
   * without an effect.
   */
  function run(
    id: number,
    work: () => Promise<RevisionActionState>,
    describe: (result: RevisionActionState) => string,
  ) {
    setError(null);
    setNotice(null);
    setPendingId(id);
    startTransition(async () => {
      try {
        const result = await work();
        if (result.status === "error") setError(result.error ?? "That did not work.");
        else setNotice(describe(result));
      } finally {
        setPendingId(null);
      }
    });
  }

  const describeSave = (result: RevisionActionState) =>
    result.alreadyStored
      ? `That document was already saved as #${result.revisionId}.`
      : `Saved as #${result.revisionId}. Nothing sent to the control plane.`;

  async function openCompare(revision: PolicyRevisionView) {
    if (comparing === revision.id) {
      setComparing(null);
      setComparedDocument(null);
      return;
    }
    setError(null);
    setPendingId(revision.id);
    try {
      const response = await fetch(`/access/revisions/${revision.id}`);
      if (!response.ok) throw new Error(String(response.status));
      const body: { document?: string } = await response.json();
      setComparedDocument(body.document ?? "");
      setComparing(revision.id);
    } catch {
      setError("Could not read that revision's document.");
    } finally {
      setPendingId(null);
    }
  }

  if (revisions.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState
          icon={GitCompare}
          title="No saved revisions yet"
          description="Headscale keeps only the current policy — no history, no versions. Save the document you have here and it becomes something you can come back to."
          action={
            canWrite ? (
              <Button
                variant="outline"
                onClick={() =>
                  run(0, () => saveRevision(editorDocument), describeSave)
                }
                disabled={pendingId !== null || editorDocument.trim() === ""}
              >
                Save the current document
              </Button>
            ) : undefined
          }
        />
        <Feedback error={error} notice={notice} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {canWrite && (
        <div className="flex items-center justify-between gap-3 rounded-control border border-line/60 bg-surface px-3 py-2">
          <span className="text-xs text-ink-muted">
            Keep the editor&apos;s current document as a revision, without touching the
            control plane.
          </span>
          <Button
            variant="outline"
            onClick={() =>
              run(0, () => saveRevision(editorDocument), describeSave)
            }
            disabled={pendingId !== null || editorDocument.trim() === ""}
          >
            Save current
          </Button>
        </div>
      )}

      <Feedback error={error} notice={notice} />

      <ul className="flex flex-col gap-2">
        {revisions.map((revision) => {
          const meta = stateMeta(revision.state);
          const busy = pendingId === revision.id;
          return (
            <li
              key={revision.id}
              className="flex flex-col gap-2 rounded-control border border-line/60 bg-surface px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Tooltip content={meta.hint}>
                  <Chip variant={meta.tone} mono>
                    {meta.label}
                  </Chip>
                </Tooltip>
                <span className="data text-xs text-ink-faint">#{revision.id}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {revision.note ?? <span className="text-ink-faint">no label</span>}
                </span>
                <span className="data shrink-0 text-[11px] text-ink-faint">
                  {formatWhen(revision.createdAt)} · {revision.actorName ?? revision.actor} ·{" "}
                  {revision.bytes.toLocaleString()} B
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <RowButton
                  icon={GitCompare}
                  label={comparing === revision.id ? "Hide diff" : "Compare with live"}
                  onClick={() => void openCompare(revision)}
                  busy={busy}
                />
                <RowButton
                  icon={SquareArrowOutUpRight}
                  label="Load into editor"
                  onClick={() =>
                    void (async () => {
                      setError(null);
                      try {
                        const response = await fetch(`/access/revisions/${revision.id}`);
                        const body: { document?: string } = await response.json();
                        if (typeof body.document === "string") onLoad(body.document);
                      } catch {
                        setError("Could not read that revision's document.");
                      }
                    })()
                  }
                  busy={busy}
                />
                {canWrite && (
                  <>
                    <RowButton
                      icon={Rocket}
                      label={revision.state === "live" ? "Re-deploy" : "Deploy to Headscale"}
                      emphasis
                      onClick={() =>
                        run(
                          revision.id,
                          () => deployRevision(revision.id),
                          () => "Deployed to the control plane.",
                        )
                      }
                      busy={busy}
                    />
                    <RowButton
                      icon={Pencil}
                      label="Rename"
                      onClick={() => {
                        setRenaming(revision.id);
                        setNoteDraft(revision.note ?? "");
                      }}
                      busy={busy}
                    />
                    <RowButton
                      icon={Trash2}
                      label="Delete"
                      onClick={() => setConfirmDelete(revision.id)}
                      busy={busy}
                    />
                  </>
                )}
              </div>

              {renaming === revision.id && (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={noteDraft}
                    maxLength={NOTE_MAX_LENGTH}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="e.g. before opening the guest tag"
                    className="min-w-0 flex-1 rounded-control border border-line-strong bg-canvas px-2 py-1 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/50"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const next = noteDraft;
                      setRenaming(null);
                      run(revision.id, () => renameRevision(revision.id, next), () => "Renamed.");
                    }}
                  >
                    <Check className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              )}

              {confirmDelete === revision.id && (
                <div className="flex flex-wrap items-center gap-2 rounded-control border border-warn-500/40 bg-warn-500/5 px-2.5 py-2 text-xs text-ink-muted">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-warn-500" aria-hidden />
                  <span className="min-w-0 flex-1">
                    {revision.state === "live"
                      ? "This is the document currently running. Deleting it leaves the tailnet untouched but removes your way back to it."
                      : "Forget this revision? The document is not kept anywhere else."}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                    Keep
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      setConfirmDelete(null);
                      run(revision.id, () => removeRevision(revision.id), () => "Revision deleted.");
                    }}
                  >
                    Delete
                  </Button>
                </div>
              )}

              {comparing === revision.id && comparedDocument !== null && (
                <div className="pt-1">
                  <p className="pb-2 text-[11px] text-ink-faint">
                    Left: the policy running now. Right: revision #{revision.id} — what
                    deploying it would change.
                  </p>
                  {/* before = live, after = the revision, so additions and removals
                      read as the effect of deploying, the same direction the
                      Review tab uses for saving. */}
                  <DiffView
                    before={liveDocument}
                    after={comparedDocument}
                    emptyTitle="Identical to what's running"
                    emptyDescription="This revision matches the policy the control plane is serving, so deploying it would change nothing."
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Feedback({ error, notice }: { error: string | null; notice: string | null }) {
  if (!error && !notice) return null;
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-xs",
        error ? "text-critical-500" : "text-ink-muted",
      )}
    >
      {error && <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
      {error ?? notice}
    </p>
  );
}

function RowButton({
  icon: Icon,
  label,
  onClick,
  busy,
  emphasis = false,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  onClick: () => void;
  busy: boolean;
  emphasis?: boolean;
}) {
  return (
    <Tooltip content={label}>
      <Button
        variant={emphasis ? "solid" : "outline"}
        size="sm"
        aria-label={label}
        disabled={busy}
        onClick={onClick}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Icon className="h-3.5 w-3.5" aria-hidden />
        )}
        <span>{label}</span>
      </Button>
    </Tooltip>
  );
}
