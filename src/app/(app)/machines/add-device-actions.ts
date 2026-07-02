"use server";

/**
 * Server Actions for the Machines "Add device" dialog.
 *
 * `createDeviceKey` mints a Headscale pre-auth key the same way Settings >
 * Pre-auth keys does, then folds in the effective login-server URL so the
 * dialog can render a ready-to-paste `tailscale up` command alongside the
 * minted key. `registerDevice` covers the opposite direction: the device
 * already ran `tailscale up --login-server` without an authkey and is holding
 * a registration key, and this action hands it to Headscale to complete the
 * enrolment. No stub: both talk to the control plane and the effective config.
 */

import { revalidatePath } from "next/cache";
import { getConfig } from "@/lib/config";
import { nodes, preAuthKeys } from "@/lib/headscale";
import { audit, authorize } from "@/lib/authz";
import { describeHeadscaleError } from "./errors";
import { PRE_AUTH_KEY_PRESETS, resolveExpiry } from "../settings/expiry-presets";
import { normalizeAclTags } from "../settings/pre-auth-keys/tags";

/** Result of {@link createDeviceKey}, shaped for the Add device dialog's reveal step. */
export type CreateDeviceKeyState =
  | { status: "idle" }
  | {
      status: "success";
      key: string;
      /** Public login-server URL for the command; "" when Headscale has none configured. */
      loginServerUrl: string;
      /** Owner label to display (display name, falling back to handle). */
      user: string;
      reusable: boolean;
      ephemeral: boolean;
      /** RFC 3339 expiry as reported by Headscale; null when the key never expires. */
      expiration: string | null;
      /** ACL tags applied to nodes enrolled with this key. */
      aclTags: string[];
    }
  | { status: "error"; error: string };

/** Create a pre-auth key for the "Add device" flow, then hand back a ready-to-paste command. */
export async function createDeviceKey(
  _prev: CreateDeviceKeyState,
  formData: FormData,
): Promise<CreateDeviceKeyState> {
  const gate = await authorize("keys.write");
  if (!gate.ok) {
    return { status: "error", error: gate.reason };
  }

  const user = readString(formData, "user");
  if (!user) {
    return { status: "error", error: "Select the user this device enrols to." };
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
      detail: { user, reusable, ephemeral, aclTags, source: "add-device" },
    });
    // The new key now shows up in the Settings > Pre-auth keys list too.
    revalidatePath("/settings/pre-auth-keys");

    const ownerLabel =
      created.user?.displayName?.trim() || created.user?.name || user;

    return {
      status: "success",
      key: created.key,
      loginServerUrl: getConfig().headscale?.loginServerUrl ?? "",
      user: ownerLabel,
      reusable: created.reusable,
      ephemeral: created.ephemeral,
      expiration: created.expiration,
      aclTags: created.aclTags,
    };
  } catch (err) {
    return { status: "error", error: describeHeadscaleError(err) };
  }
}

function readString(formData: FormData, name: string): string {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw.trim() : "";
}

/** Result of {@link registerDevice}, shaped for the Add device dialog's "Register device" mode. */
export type RegisterDeviceState =
  | { status: "success"; nodeName: string }
  | { status: "error"; error: string };

/**
 * Complete an interactive `tailscale up --login-server <url>` login (no
 * authkey) by handing Headscale the registration key the device printed.
 * Unlike `createDeviceKey`, there's no key to reveal here: the device is
 * enrolled the moment this succeeds.
 */
export async function registerDevice(input: {
  user: string;
  key: string;
}): Promise<RegisterDeviceState> {
  const gate = await authorize("keys.write");
  if (!gate.ok) {
    return { status: "error", error: gate.reason };
  }

  const user = input.user.trim();
  if (!user) {
    return { status: "error", error: "Select the user this device enrols to." };
  }

  const key = input.key.trim();
  if (!key) {
    return { status: "error", error: "Paste the registration key shown on the device." };
  }

  try {
    const node = await nodes.register(user, key);
    await audit(gate.session, {
      action: "node.register",
      targetType: "node",
      targetId: node.id,
      targetName: node.name || user,
      detail: { user },
    });
    revalidatePath("/machines");
    return { status: "success", nodeName: node.name };
  } catch (err) {
    return { status: "error", error: describeHeadscaleError(err) };
  }
}
