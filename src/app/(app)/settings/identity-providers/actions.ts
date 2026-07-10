"use server";

/**
 * Server Actions for Settings > Identity providers.
 *
 * Manages the `oidc_provider` rows (see `@/lib/auth/oidc-providers`) - any
 * number of additional OIDC providers, each shown as its own button on the
 * login page alongside the legacy single-provider config (Settings >
 * Authentication). All four operations are gated on `settings.write` and
 * audited; the raw client secret never leaves the server in either direction.
 */

import { revalidatePath } from "next/cache";
import {
  createProvider,
  removeProvider,
  setProviderEnabled,
  updateProvider,
  type ProviderInput,
} from "@/lib/auth/oidc-providers";
import { clearOidcConfigCache } from "@/lib/auth/oidc";
import { ConfigError } from "@/lib/config";
import { audit, authorize } from "@/lib/authz";

const PATH = "/settings/identity-providers";

export type ProviderActionState =
  | { status: "success" }
  | { status: "error"; error: string };

function describe(err: unknown): string {
  return err instanceof ConfigError ? err.message : "Couldn't save the provider.";
}

/** Add a new provider, enabled by default. */
export async function addProvider(
  input: ProviderInput,
): Promise<ProviderActionState> {
  const gate = await authorize("settings.write");
  if (!gate.ok) return { status: "error", error: gate.reason };

  let id: string;
  try {
    id = createProvider(input);
  } catch (err) {
    return { status: "error", error: describe(err) };
  }

  // A fresh id can't be cached yet, but evict it defensively (a reused id from
  // a prior delete+recreate would otherwise serve stale discovery).
  clearOidcConfigCache(id);
  await audit(gate.session, {
    action: "config.oidc_provider.create",
    targetType: "config",
    targetName: input.name,
  });
  revalidatePath(PATH);
  return { status: "success" };
}

/** Edit a provider's name/issuer/client id, optionally rotating its secret. */
export async function editProvider(
  id: string,
  input: Omit<ProviderInput, "clientSecret"> & { clientSecret?: string },
): Promise<ProviderActionState> {
  const gate = await authorize("settings.write");
  if (!gate.ok) return { status: "error", error: gate.reason };

  try {
    updateProvider(id, input);
  } catch (err) {
    return { status: "error", error: describe(err) };
  }

  // A changed issuer or rotated secret must not keep serving stale discovery.
  clearOidcConfigCache(id);
  await audit(gate.session, {
    action: "config.oidc_provider.update",
    targetType: "config",
    targetId: id,
    targetName: input.name,
  });
  revalidatePath(PATH);
  return { status: "success" };
}

/** Toggle a provider live/off without changing its other fields. */
export async function toggleProvider(
  id: string,
  enabled: boolean,
): Promise<ProviderActionState> {
  const gate = await authorize("settings.write");
  if (!gate.ok) return { status: "error", error: gate.reason };

  setProviderEnabled(id, enabled);

  // Disabling must stop the provider taking logins immediately, not next boot.
  clearOidcConfigCache(id);
  await audit(gate.session, {
    action: enabled ? "config.oidc_provider.enable" : "config.oidc_provider.disable",
    targetType: "config",
    targetId: id,
  });
  revalidatePath(PATH);
  return { status: "success" };
}

/** Permanently remove a provider. */
export async function deleteProvider(id: string): Promise<ProviderActionState> {
  const gate = await authorize("settings.write");
  if (!gate.ok) return { status: "error", error: gate.reason };

  removeProvider(id);

  // Drop any cached discovery for the now-gone provider.
  clearOidcConfigCache(id);
  await audit(gate.session, {
    action: "config.oidc_provider.delete",
    targetType: "config",
    targetId: id,
  });
  revalidatePath(PATH);
  return { status: "success" };
}
