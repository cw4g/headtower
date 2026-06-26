"use server";

/**
 * Server Actions for the API keys view.
 *
 * Real mutations against the Headscale admin API, each followed by a
 * revalidate. Expire and delete additionally refuse to touch the key this
 * session authenticates with - a defence-in-depth guard behind the UI's own.
 */

import { revalidatePath } from "next/cache";
import { apiKeys } from "@/lib/headscale";
import { describeHeadscaleError } from "../errors";
import { API_KEY_PRESETS, resolveExpiry } from "../expiry-presets";
import { isCurrentApiKey } from "./current-key";

const PATH = "/settings/api-keys";

/** Result of {@link createApiKey}, shaped for the create dialog. */
export type CreateApiKeyState =
  | { status: "idle" }
  | { status: "success"; secret: string }
  | { status: "error"; error: string };

/** Generic result for the row-level expire/delete actions. */
export type ApiKeyActionState =
  | { status: "success" }
  | { status: "error"; error: string };

/** Mint an API key, returning the one-time secret for the dialog to reveal. */
export async function createApiKey(
  _prev: CreateApiKeyState,
  formData: FormData,
): Promise<CreateApiKeyState> {
  const expiryId = readString(formData, "expiry");
  const expiration = resolveExpiry(API_KEY_PRESETS, expiryId);
  if (expiration === null || expiration === undefined) {
    // API keys require an absolute expiry; there is no "never" preset.
    return { status: "error", error: "Choose how long the key stays valid." };
  }

  try {
    const secret = await apiKeys.create({ expiration });
    revalidatePath(PATH);
    return { status: "success", secret };
  } catch (err) {
    return { status: "error", error: describeHeadscaleError(err) };
  }
}

/** Expire an API key by prefix. Refuses the current session's own key. */
export async function expireApiKey(prefix: string): Promise<ApiKeyActionState> {
  if (isCurrentApiKey(prefix)) {
    return {
      status: "error",
      error: "This is the key Headtower is using. Expiring it would lock you out.",
    };
  }
  try {
    await apiKeys.expire(prefix);
    revalidatePath(PATH);
    return { status: "success" };
  } catch (err) {
    return { status: "error", error: describeHeadscaleError(err) };
  }
}

/** Delete an API key by prefix. Refuses the current session's own key. */
export async function deleteApiKey(prefix: string): Promise<ApiKeyActionState> {
  if (isCurrentApiKey(prefix)) {
    return {
      status: "error",
      error: "This is the key Headtower is using. Deleting it would lock you out.",
    };
  }
  try {
    await apiKeys.remove(prefix);
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
