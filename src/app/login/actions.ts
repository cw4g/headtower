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
import { beginLogin, isOidcEnabled } from "@/lib/auth/oidc";

/** Start sign-in. Invoked as a `<form action={startLogin}>` submit. */
export async function startLogin(formData: FormData): Promise<void> {
  if (!isOidcEnabled()) {
    // Operator mode has no sign-in; nothing to start.
    redirect("/");
  }

  const origin = originFromHeaders(await headers());
  const authorizationUrl = await beginLogin(origin, safeNext(formData.get("next")));

  // External redirect to the identity provider; throws NEXT_REDIRECT.
  redirect(authorizationUrl);
}

/** Only honour a same-app return path (leading single slash), else drop it. */
function safeNext(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  return value;
}
