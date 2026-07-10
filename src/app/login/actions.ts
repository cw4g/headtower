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
    safeNext(formData.get("next"), origin),
  );

  // External redirect to the identity provider; throws NEXT_REDIRECT.
  redirect(authorizationUrl);
}

/**
 * Only honour a same-app return path, else drop it. "//host" and "/\host" both
 * resolve to a foreign origin (the browser and `new URL` treat a backslash as a
 * slash), so reject a slash OR backslash right after the leading slash, then
 * confirm the path resolves back to our own origin before trusting it.
 */
function safeNext(
  value: FormDataEntryValue | null,
  origin: string,
): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/")) return undefined;
  if (value[1] === "/" || value[1] === "\\") return undefined;
  try {
    if (new URL(value, origin).origin !== new URL(origin).origin) {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return value;
}

/** Fall back to the legacy provider for any old/bare form submit. */
function safeProvider(value: FormDataEntryValue | null): string {
  return typeof value === "string" && value.trim() ? value.trim() : LEGACY_PROVIDER_ID;
}
