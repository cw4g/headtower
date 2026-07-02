"use server";

/**
 * Server Actions for the Access (ACL policy) view.
 *
 * The save runs on the server, PUTs the raw HuJSON document to Headscale via our
 * client, then revalidates the route so a fresh read reflects the stored policy.
 * Headscale validates the document authoritatively and rejects an invalid one
 * with a typed error; we relay its reason (often with a line number) back to the
 * editor rather than guessing.
 */

import { revalidatePath } from "next/cache";
import { policy } from "@/lib/headscale";
import { audit, authorize } from "@/lib/authz";
import {
  evaluateReachability,
  parsePolicy,
  type EvalQuery,
  type EvalResult,
} from "@/lib/policy";
import { describeHeadscaleError } from "./errors";

/** Result of {@link savePolicy}, shaped for the client editor. */
export interface SavePolicyState {
  status: "success" | "error";
  /** Present only when `status === "error"`. */
  error?: string;
  /** New last-updated timestamp from the control plane, on success. */
  updatedAt?: string | null;
}

/** Persist the policy document from the editor, then revalidate the view. */
export async function savePolicy(document: string): Promise<SavePolicyState> {
  if (typeof document !== "string" || document.trim() === "") {
    return { status: "error", error: "The policy document is empty." };
  }

  const gate = await authorize("acls.write");
  if (!gate.ok) {
    return { status: "error", error: gate.reason };
  }

  let updatedAt: string | null = null;
  try {
    const saved = await policy.set(document);
    updatedAt = saved?.updatedAt ?? null;
  } catch (err) {
    return { status: "error", error: describeHeadscaleError(err) };
  }

  await audit(gate.session, {
    action: "acl.save",
    targetType: "policy",
    detail: { bytes: document.length, updatedAt },
  });
  revalidatePath("/access");
  return { status: "success", updatedAt };
}

/** How an unsaved edit changes a reachability verdict versus the saved policy. */
export type ReachabilityDelta = "same" | "newly-allow" | "newly-deny";

/** Input for {@link testReachability}. */
export interface ReachabilityRequest {
  /** The stored policy document (what the client believes is saved). */
  savedDocument: string;
  /** The current editor document; when equal to `savedDocument`, not dirty. */
  editedDocument: string;
  src: string;
  dst: string;
  /** Optional destination port as typed; blank/invalid means "any". */
  port?: string;
  /** Optional protocol filter (tcp/udp/icmp/any). */
  protocol?: string;
}

/** Result of {@link testReachability}, shaped for the Test tab. */
export interface ReachabilityState {
  status: "success" | "error";
  error?: string;
  /** Verdict against the saved policy. */
  saved?: EvalResult;
  /** Verdict against the edited policy; null when the editor isn't dirty. */
  edited?: EvalResult | null;
  /** How the edit shifts the verdict (only when dirty). */
  delta?: ReachabilityDelta;
}

/** Parse the typed port into a positive integer, or null for "any"/invalid. */
function coercePort(raw: string | undefined): number | null {
  if (!raw || raw.trim() === "") return null;
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n < 0 || n > 65535) return null;
  return n;
}

/**
 * Evaluate a source -> destination reachability question against the policy on
 * the server (RBAC-gated read). When the editor is dirty, both the saved and the
 * edited document are evaluated so the caller can surface the delta explicitly.
 * Pure ACL semantics live in {@link evaluateReachability}; this action only
 * gates, parses, and diffs the two verdicts.
 */
export async function testReachability(
  req: ReachabilityRequest,
): Promise<ReachabilityState> {
  const gate = await authorize("acls.read");
  if (!gate.ok) {
    return { status: "error", error: gate.reason };
  }

  if (req.src.trim() === "" || req.dst.trim() === "") {
    return { status: "error", error: "Pick both a source and a destination." };
  }

  const query: EvalQuery = {
    src: req.src,
    dst: req.dst,
    port: coercePort(req.port),
    protocol: req.protocol ?? null,
  };

  const savedModel = parsePolicy(req.savedDocument);
  if (!savedModel.ok) {
    return { status: "error", error: "The saved policy isn't valid HuJSON." };
  }
  const saved = evaluateReachability(savedModel.model, query);

  const dirty = req.editedDocument !== req.savedDocument;
  if (!dirty) {
    return { status: "success", saved, edited: null, delta: "same" };
  }

  const editedModel = parsePolicy(req.editedDocument);
  if (!editedModel.ok) {
    // Can't evaluate an unparseable edit; return the saved verdict and say so.
    return {
      status: "success",
      saved,
      edited: null,
      delta: "same",
    };
  }
  const edited = evaluateReachability(editedModel.model, query);

  let delta: ReachabilityDelta = "same";
  if (saved.decision !== edited.decision) {
    delta = edited.decision === "allow" ? "newly-allow" : "newly-deny";
  }

  return { status: "success", saved, edited, delta };
}
