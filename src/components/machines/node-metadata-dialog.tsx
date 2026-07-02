"use client";

import * as React from "react";
import { NotebookPen, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field, Select } from "@/components/ui/field";
import { TokenInput } from "@/components/ui/token-input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  ENVIRONMENTS,
  NOTE_MAX_LENGTH,
  LABEL_MAX_COUNT,
  LABEL_MAX_LENGTH,
  environmentMeta,
  labelColor,
  normalizeLabels,
  type NodeEnvironment,
  type NodeMetadataValue,
} from "@/lib/db/node-metadata-types";
import {
  saveNodeMetadata,
  clearNodeMetadata,
} from "@/app/(app)/machines/[id]/metadata-actions";

/**
 * Editor for a node's Headtower-local metadata: an operator note, a deployment
 * environment, and free labels. It renders its own trigger button and the
 * controlled dialog, so a Server Component (the detail page's Metadata card) can
 * drop it in without any client state of its own.
 *
 * Every field here is Headtower-only: it is saved to Headtower's SQLite and
 * never pushed to Headscale, which the dialog copy makes explicit.
 */
export function NodeMetadataDialog({
  nodeId,
  name,
  metadata,
  labelSuggestions,
  className,
}: {
  nodeId: string;
  name: string;
  /** Current stored metadata; empty fields when the node has no row yet. */
  metadata: NodeMetadataValue;
  /** Labels already used across the fleet, offered as autocomplete. */
  labelSuggestions?: string[];
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const hasExisting =
    (metadata.note != null && metadata.note.trim() !== "") ||
    metadata.environment != null ||
    metadata.labels.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className={className}
      >
        <NotebookPen className="h-3.5 w-3.5" aria-hidden />
        {hasExisting ? "Edit metadata" : "Add metadata"}
      </Button>
      <DialogContent>
        {open && (
          <MetadataForm
            nodeId={nodeId}
            name={name}
            metadata={metadata}
            hasExisting={hasExisting}
            labelSuggestions={labelSuggestions}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Inline, on-brand failure note - mirrors the node action dialogs. */
function DialogError({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 px-5 pb-1 text-xs text-critical-500">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function MetadataForm({
  nodeId,
  name,
  metadata,
  hasExisting,
  labelSuggestions,
  onDone,
}: {
  nodeId: string;
  name: string;
  metadata: NodeMetadataValue;
  hasExisting: boolean;
  labelSuggestions?: string[];
  onDone: () => void;
}) {
  const [note, setNote] = React.useState(metadata.note ?? "");
  const [environment, setEnvironment] = React.useState<NodeEnvironment | "">(
    metadata.environment ?? "",
  );
  const [labels, setLabels] = React.useState<string[]>(metadata.labels);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [clearing, startClearing] = React.useTransition();

  const busy = pending || clearing;
  const noteTooLong = note.trim().length > NOTE_MAX_LENGTH;
  const atLabelLimit = labels.length >= LABEL_MAX_COUNT;

  // Suggestions the operator hasn't already applied.
  const suggestions = React.useMemo(() => {
    const applied = new Set(labels);
    return normalizeLabels(labelSuggestions ?? []).filter(
      (label) => !applied.has(label),
    );
  }, [labelSuggestions, labels]);

  function updateLabels(next: string[]) {
    // Enforce the same dedupe + per-label cap + count cap the store applies, so
    // what the operator sees is exactly what will be saved.
    setLabels(normalizeLabels(next));
    if (error) setError(null);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || noteTooLong) return;
    startTransition(async () => {
      const result = await saveNodeMetadata(nodeId, {
        note,
        environment,
        labels,
      });
      if (result.status === "success") {
        toast(`Metadata saved for “${name}”`);
        onDone();
      } else {
        setError(result.error ?? "Couldn't save metadata.");
      }
    });
  }

  function handleClear() {
    if (busy) return;
    startClearing(async () => {
      const result = await clearNodeMetadata(nodeId);
      if (result.status === "success") {
        toast(`Metadata cleared for “${name}”`);
        onDone();
      } else {
        setError(result.error ?? "Couldn't clear metadata.");
      }
    });
  }

  const noteLength = note.trim().length;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Node metadata</DialogTitle>
        <DialogDescription>
          Notes, an environment, and labels for{" "}
          <span className="font-medium text-ink">{name}</span>. Stored in
          Headtower only - never pushed to Headscale.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit}>
        <DialogBody className="flex flex-col gap-4">
          <Field
            label="Note"
            htmlFor="metadata-note"
            error={noteTooLong ? "Note is too long." : undefined}
            description={
              noteTooLong ? undefined : (
                <span className="flex justify-between gap-2">
                  <span>Free-form. Markdown is not rendered.</span>
                  <span
                    className={cn(
                      "data tabular-nums",
                      noteLength > NOTE_MAX_LENGTH && "text-critical-500",
                    )}
                  >
                    {noteLength}/{NOTE_MAX_LENGTH}
                  </span>
                </span>
              )
            }
          >
            <textarea
              id="metadata-note"
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                if (error) setError(null);
              }}
              rows={4}
              maxLength={NOTE_MAX_LENGTH}
              placeholder="e.g. Bastion host - reboots on Sundays."
              disabled={busy}
              aria-invalid={noteTooLong || undefined}
              className={cn(
                "w-full resize-y rounded-control border bg-surface-2 px-3 py-2 text-sm text-ink transition-colors placeholder:text-ink-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-beacon-500/40 disabled:pointer-events-none disabled:opacity-50",
                noteTooLong
                  ? "border-critical-500"
                  : "border-line-strong focus-visible:border-beacon-500",
              )}
            />
          </Field>

          <Field
            label="Environment"
            htmlFor="metadata-environment"
            description="Where this node runs. Optional."
          >
            <Select
              id="metadata-environment"
              value={environment}
              onChange={(e) => {
                setEnvironment(e.target.value as NodeEnvironment | "");
                if (error) setError(null);
              }}
              disabled={busy}
            >
              <option value="">No environment</option>
              {ENVIRONMENTS.map((env) => (
                <option key={env.value} value={env.value}>
                  {env.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Labels"
            htmlFor="metadata-labels"
            description={
              <span className="flex justify-between gap-2">
                <span>
                  Enter or comma to add. Up to {LABEL_MAX_LENGTH} chars each.
                </span>
                <span
                  className={cn(
                    "data tabular-nums",
                    atLabelLimit && "text-warn-500",
                  )}
                >
                  {labels.length}/{LABEL_MAX_COUNT}
                </span>
              </span>
            }
          >
            <TokenInput
              id="metadata-labels"
              values={labels}
              onChange={updateLabels}
              ariaLabel="Node labels"
              mono={false}
              placeholder={atLabelLimit ? "Label limit reached" : "team-a"}
              suggestions={suggestions}
            />
          </Field>
        </DialogBody>
        {error && <DialogError>{error}</DialogError>}
        <DialogFooter className="justify-between">
          <div>
            {hasExisting && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                disabled={busy}
                className="text-critical-500 hover:text-critical-500"
              >
                {clearing ? "Clearing…" : "Clear all"}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="sm" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant="solid"
              size="sm"
              disabled={busy || noteTooLong}
            >
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </>
  );
}

/**
 * The environment badge, shared by the detail card and the list rows. Renders
 * nothing when the node has no environment set, so callers can drop it in
 * unconditionally. `size="sm"` shrinks it for dense list rows.
 */
export function EnvironmentBadge({
  environment,
  size = "md",
  className,
}: {
  environment: NodeEnvironment | null | undefined;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = environmentMeta(environment);
  if (!meta) return null;
  return (
    <Chip
      variant={meta.chip}
      className={cn(size === "sm" && "px-1 py-0 text-[11px]", className)}
      title={`Environment: ${meta.label}`}
    >
      {meta.label}
    </Chip>
  );
}

/** A single hash-colored label chip: neutral body, a stable per-label dot. */
export function NodeLabelChip({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "data inline-flex items-center gap-1 rounded-[0.3rem] border border-line-strong bg-surface-2 px-1.5 py-0.5 text-xs text-ink-muted",
        className,
      )}
      title={label}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: labelColor(label) }}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

/**
 * A wrap of label chips, optionally capped with a "+N" overflow chip for dense
 * list rows. Renders nothing when there are no labels.
 */
export function NodeLabelChips({
  labels,
  max,
  className,
}: {
  labels: string[];
  /** Cap the number of chips shown; the rest collapse into a "+N" chip. */
  max?: number;
  className?: string;
}) {
  if (labels.length === 0) return null;
  const shown = max != null ? labels.slice(0, max) : labels;
  const extra = labels.length - shown.length;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {shown.map((label) => (
        <NodeLabelChip key={label} label={label} />
      ))}
      {extra > 0 && (
        <Chip variant="default" mono title={labels.slice(shown.length).join(", ")}>
          +{extra}
        </Chip>
      )}
    </span>
  );
}
