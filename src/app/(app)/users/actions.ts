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

// A minimal "looks like an email" shape. Only the obvious garbage is rejected;
// the control plane is the final word on what it accepts.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Read a trimmed string from a form field, or undefined when blank or absent. */
function optional(raw: FormDataEntryValue | null): string | undefined {
  const value = typeof raw === "string" ? raw.trim() : "";
  return value ? value : undefined;
}

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

  // Display name, email, and picture are optional. Headscale has no
  // user-update endpoint, so create time is the only chance to set them.
  const displayName = optional(formData.get("displayName"));
  const email = optional(formData.get("email"));
  const pictureUrl = optional(formData.get("pictureUrl"));

  if (email && !EMAIL_RE.test(email)) {
    return { status: "error", error: "Enter a valid email address, or leave it blank." };
  }

  try {
    const created = await users.create({ name, displayName, email, pictureUrl });
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

/** Outcome of a user mutation, shaped for the detail page's inline errors. */
export interface UserActionResult {
  status: "success" | "error";
  /** Present only when `status === "error"`. */
  error?: string;
}

/** Refresh the users list and this user's detail after a mutation. */
function revalidateUser(id: string): void {
  revalidatePath("/users");
  revalidatePath(`/users/${id}`);
}

/**
 * Rename a tailnet user. Renaming changes the user's name across the control
 * plane, but does NOT rewrite ACL policy references to the old name - the
 * caller is warned of this in the dialog.
 */
export async function renameUser(
  id: string,
  newName: string,
): Promise<UserActionResult> {
  const gate = await authorize("users.write");
  if (!gate.ok) {
    return { status: "error", error: gate.reason };
  }

  const name = newName.trim();
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
    const updated = await users.rename(id, name);
    await audit(gate.session, {
      action: "user.rename",
      targetType: "user",
      targetId: id,
      targetName: updated.name,
      detail: { name: updated.name },
    });
  } catch (err) {
    return { status: "error", error: describeHeadscaleError(err) };
  }

  revalidateUser(id);
  return { status: "success" };
}

/**
 * Permanently delete a tailnet user. The control plane rejects the delete while
 * the user still owns nodes; the dialog blocks that case up front, and any
 * remaining refusal surfaces as an inline reason.
 */
export async function deleteUser(id: string): Promise<UserActionResult> {
  const gate = await authorize("users.write");
  if (!gate.ok) {
    return { status: "error", error: gate.reason };
  }

  try {
    await users.remove(id);
    await audit(gate.session, {
      action: "user.delete",
      targetType: "user",
      targetId: id,
    });
  } catch (err) {
    return { status: "error", error: describeHeadscaleError(err) };
  }

  // The user is gone: refresh the list and drop the now-dead detail path.
  revalidateUser(id);
  return { status: "success" };
}
