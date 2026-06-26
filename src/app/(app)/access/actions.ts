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

  let updatedAt: string | null = null;
  try {
    const saved = await policy.set(document);
    updatedAt = saved?.updatedAt ?? null;
  } catch (err) {
    return { status: "error", error: describeHeadscaleError(err) };
  }

  revalidatePath("/access");
  return { status: "success", updatedAt };
}
