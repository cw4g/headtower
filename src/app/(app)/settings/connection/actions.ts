"use server";

/**
 * Server Actions for the Connection view.
 *
 * The setup wizard's first step, made editable for the life of the instance -
 * no restart, no env edit. Two operations, both gated on `settings.write` and,
 * for the persisting one, audited:
 *
 *   testConnection   live, read-only probe of a URL + key (persists nothing).
 *                    When the key field is left blank the currently stored key
 *                    is used, so an operator can re-test after editing only the
 *                    URL without re-pasting the secret.
 *   saveConnection   validate + persist via setConfig, then revalidate. A blank
 *                    key means "keep the existing one" (URL-only edit); a
 *                    non-blank key rotates it. The raw secret never leaves the
 *                    server in either direction.
 */

import { revalidatePath } from "next/cache";
import {
  ConfigError,
  getConfig,
  setConfig,
  testHeadscaleConnection,
  type ConnectionTestResult,
} from "@/lib/config";
import { audit, authorize } from "@/lib/authz";

const PATH = "/settings/connection";

/** Result of {@link saveConnection}. `rotated` reports whether the key changed. */
export type SaveConnectionState =
  | { status: "success"; rotated: boolean }
  | { status: "error"; error: string };

/**
 * Live-probe a candidate connection without persisting anything. A blank key
 * falls back to the stored key so the URL can be re-tested on its own.
 */
export async function testConnection(input: {
  url: string;
  apiKey: string;
}): Promise<ConnectionTestResult> {
  const gate = await authorize("settings.write");
  if (!gate.ok) return { ok: false, status: "error", message: gate.reason };

  const url = input.url.trim();
  let apiKey = input.apiKey.trim();
  if (!apiKey) {
    const current = getConfig().headscale;
    if (current) apiKey = current.apiKey;
  }
  if (!apiKey) {
    return {
      ok: false,
      status: "error",
      message: "Enter an API key to test, or save the current one first.",
    };
  }
  return testHeadscaleConnection(url, apiKey);
}

/**
 * Persist a connection change. A blank key keeps the stored one (URL-only edit);
 * a supplied key rotates it. Validates through {@link setConfig}, then
 * revalidates the view so the readout reflects the new state.
 */
export async function saveConnection(input: {
  url: string;
  apiKey: string;
}): Promise<SaveConnectionState> {
  const gate = await authorize("settings.write");
  if (!gate.ok) return { status: "error", error: gate.reason };

  const url = input.url.trim();
  if (!url) return { status: "error", error: "Enter the Headscale URL." };

  let apiKey = input.apiKey.trim();
  const rotating = apiKey.length > 0;
  if (!apiKey) {
    // No new key supplied: reuse the stored one so a URL-only edit is possible.
    const current = getConfig().headscale;
    if (!current) {
      return {
        status: "error",
        error: "Enter an API key. There is no stored key to keep.",
      };
    }
    apiKey = current.apiKey;
  }

  try {
    setConfig({ headscale: { url, apiKey } });
  } catch (err) {
    return {
      status: "error",
      error: err instanceof ConfigError ? err.message : "Couldn't save the connection.",
    };
  }

  await audit(gate.session, {
    action: "config.connection",
    targetType: "config",
    targetName: hostOf(url),
    detail: { host: hostOf(url), rotatedKey: rotating },
  });
  revalidatePath(PATH);
  return { status: "success", rotated: rotating };
}

/** Host (and port) of a URL for the audit label; falls back to the raw string. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
