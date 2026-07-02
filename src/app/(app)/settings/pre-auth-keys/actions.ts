"use server";

/**
 * Server Actions for the Pre-auth keys view.
 *
 * Each mutation runs on the server, hits the Headscale admin API via our client,
 * then revalidates the route so the readout reflects the new state on the next
 * render. No stubs: these talk to the control plane.
 */

import { revalidatePath } from "next/cache";
import { HeadscaleRequestError, preAuthKeys } from "@/lib/headscale";
import { audit, authorize } from "@/lib/authz";
import { describeHeadscaleError } from "../errors";
import { PRE_AUTH_KEY_PRESETS, resolveExpiry } from "../expiry-presets";
import { normalizeAclTags } from "./tags";

const PATH = "/settings/pre-auth-keys";

/** Result of {@link createPreAuthKey}, shaped for the create dialog. */
export type CreatePreAuthKeyState =
  | { status: "idle" }
  | { status: "success"; key: string; id: string }
  | { status: "error"; error: string };

/** Generic result for the row-level expire/delete actions. */
export type PreAuthKeyActionState =
  | { status: "success" }
  | { status: "error"; error: string };

/** Create a pre-auth key from the dialog, then revalidate the list. */
export async function createPreAuthKey(
  _prev: CreatePreAuthKeyState,
  formData: FormData,
): Promise<CreatePreAuthKeyState> {
  const gate = await authorize("keys.write");
  if (!gate.ok) {
    return { status: "error", error: gate.reason };
  }

  const user = readString(formData, "user");
  if (!user) {
    return { status: "error", error: "Select the user this key enrols nodes for." };
  }

  const expiryId = readString(formData, "expiry") || "never";
  const expiration = resolveExpiry(PRE_AUTH_KEY_PRESETS, expiryId);
  if (expiration === null) {
    return { status: "error", error: "Choose a valid expiry." };
  }

  const reusable = formData.get("reusable") === "on";
  const ephemeral = formData.get("ephemeral") === "on";
  const aclTags = normalizeAclTags(formData.getAll("tags").map(String));

  try {
    const created = await preAuthKeys.create({
      user,
      reusable,
      ephemeral,
      expiration,
      aclTags: aclTags.length > 0 ? aclTags : undefined,
    });
    await audit(gate.session, {
      action: "preauthkey.create",
      targetType: "preauthkey",
      targetId: created.id,
      targetName: user,
      detail: { user, reusable, ephemeral, aclTags },
    });
    revalidatePath(PATH);
    return { status: "success", key: created.key, id: created.id };
  } catch (err) {
    return { status: "error", error: describeHeadscaleError(err) };
  }
}

/**
 * Expire a pre-auth key. Headscale 0.29 keys expire by numeric `id`; 0.26 - 0.28
 * expire by `{ user, key }`. We try the id form first and fall back to the
 * legacy shape only on an HTTP-level rejection, so one action works across the
 * supported range.
 */
export async function expirePreAuthKey(input: {
  id: string;
  user: string;
  key: string;
}): Promise<PreAuthKeyActionState> {
  const gate = await authorize("keys.write");
  if (!gate.ok) {
    return { status: "error", error: gate.reason };
  }

  try {
    try {
      await preAuthKeys.expire({ id: input.id });
    } catch (err) {
      if (err instanceof HeadscaleRequestError && input.user && input.key) {
        await preAuthKeys.expire({ user: input.user, key: input.key });
      } else {
        throw err;
      }
    }
    await audit(gate.session, {
      action: "preauthkey.expire",
      targetType: "preauthkey",
      targetId: input.id,
      targetName: input.user || null,
    });
    revalidatePath(PATH);
    return { status: "success" };
  } catch (err) {
    return { status: "error", error: describeHeadscaleError(err) };
  }
}

/**
 * Delete a pre-auth key by id. Headscale 0.29+ only; earlier releases have no
 * delete endpoint and reject the call, surfacing as a normal control-plane
 * error rather than a silent no-op.
 */
export async function deletePreAuthKey(input: {
  id: string;
  user: string;
}): Promise<PreAuthKeyActionState> {
  const gate = await authorize("keys.write");
  if (!gate.ok) {
    return { status: "error", error: gate.reason };
  }

  try {
    await preAuthKeys.remove({ id: input.id });
    await audit(gate.session, {
      action: "preauthkey.delete",
      targetType: "preauthkey",
      targetId: input.id,
      targetName: input.user || null,
    });
    revalidatePath(PATH);
    return { status: "success" };
  } catch (err) {
    return { status: "error", error: describeHeadscaleError(err) };
  }
}

function readString(formData: FormData, name: string): string {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw.trim() : "";
}
