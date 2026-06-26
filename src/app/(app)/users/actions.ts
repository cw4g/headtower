"use server";

/**
 * Server Actions for the Users view.
 *
 * Mutations run on the server, hit the Headscale admin API via our client, then
 * revalidate the route so the readout reflects the new state on the next render.
 */

import { revalidatePath } from "next/cache";
import { users } from "@/lib/headscale";
import { audit, authorize } from "@/lib/authz";
import { describeHeadscaleError } from "./errors";

/** Result of {@link createUser}, shaped for React's `useActionState`. */
export interface CreateUserState {
  status: "idle" | "success" | "error";
  /** Present only when `status === "error"`. */
  error?: string;
}

// Headscale usernames: a leading alphanumeric, then alphanumerics plus a few
// separators. Kept deliberately permissive; the control plane is the final word.
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]*$/i;

/** Create a tailnet user from the Add-user dialog, then revalidate the list. */
export async function createUser(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const gate = await authorize("users.write");
  if (!gate.ok) {
    return { status: "error", error: gate.reason };
  }

  const raw = formData.get("name");
  const name = typeof raw === "string" ? raw.trim() : "";

  if (!name) {
    return { status: "error", error: "Enter a username." };
  }
  if (name.length > 63) {
    return { status: "error", error: "Username must be 63 characters or fewer." };
  }
  if (!USERNAME_RE.test(name)) {
    return {
      status: "error",
      error: "Use letters or digits, optionally with dots, hyphens, or underscores.",
    };
  }

  try {
    const created = await users.create({ name });
    await audit(gate.session, {
      action: "user.create",
      targetType: "user",
      targetId: created.id,
      targetName: created.name,
    });
  } catch (err) {
    return { status: "error", error: describeHeadscaleError(err) };
  }

  revalidatePath("/users");
  return { status: "success" };
}
