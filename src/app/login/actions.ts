"use server";

/**
 * Sign-in entry point (Server Action).
 *
 * Begins the OIDC authorization-code + PKCE flow: mints the transaction secrets,
 * stashes them in httpOnly cookies, and redirects the browser to the provider's
 * authorization endpoint. The callback route (`/login/callback`) finishes it.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { originFromHeaders } from "@/lib/auth/request";
import { beginLogin, isOidcEnabled, LEGACY_PROVIDER_ID } from "@/lib/auth/oidc";

/**
 * Start sign-in. Invoked as a `<form action={startLogin}>` submit - the login
 * page renders one form per enabled provider, each with a hidden `provider`
 * field naming which one to begin.
 */
export async function startLogin(formData: FormData): Promise<void> {
  if (!isOidcEnabled()) {
    // Operator mode has no sign-in; nothing to start.
    redirect("/");
  }

  const origin = originFromHeaders(await headers());
  const providerId = safeProvider(formData.get("provider"));
  const authorizationUrl = await beginLogin(
    origin,
    providerId,
    safeNext(formData.get("next")),
  );

  // External redirect to the identity provider; throws NEXT_REDIRECT.
  redirect(authorizationUrl);
}

/** Only honour a same-app return path (leading single slash), else drop it. */
function safeNext(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  return value;
}

/** Fall back to the legacy provider for any old/bare form submit. */
function safeProvider(value: FormDataEntryValue | null): string {
  return typeof value === "string" && value.trim() ? value.trim() : LEGACY_PROVIDER_ID;
}
