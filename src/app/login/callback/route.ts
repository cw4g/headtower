/**
 * OIDC callback (Route Handler).
 *
 * The provider redirects the browser here with `?code&state`. This handler
 * finishes the authorization-code + PKCE flow:
 *
 *   1. Validate state / PKCE / nonce and exchange the code for tokens.
 *   2. Upsert the `app_user` for the returned identity (default role for new
 *      accounts; refreshed profile + last_login for returning ones).
 *   3. Create a server-side session row and set the signed `ht_session` cookie
 *      directly on the redirect response (so it survives the redirect).
 *   4. Record an audit entry and send the operator into the console.
 *
 * Any failure (provider error, expired/forged transaction, exchange failure)
 * clears the transaction and bounces back to `/login` with an `error` code.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  completeLogin,
  isOidcEnabled,
  LOGIN_TRANSACTION_COOKIES,
  readLoginTransaction,
} from "@/lib/auth/oidc";
import {
  createSession,
  sessionCookieOptions,
  upsertOidcUser,
} from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/session-token";
import { originFromHeaders } from "@/lib/auth/request";
import { recordAudit } from "@/lib/audit";

// Always run against live state; never cache or prerender a callback.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  // The public origin (scheme://host) from the proxy's forwarding headers - NOT
  // request.nextUrl, which behind the reverse proxy is the internal bind address
  // (0.0.0.0:3000). Every redirect below builds on this so it stays on the
  // public host + base path.
  const origin = originFromHeaders(request.headers);

  if (!isOidcEnabled()) {
    return back(origin, "disabled");
  }

  const currentUrl = new URL(request.url);

  // The provider may report an error instead of returning a code.
  const providerError = currentUrl.searchParams.get("error");
  if (providerError) {
    return back(origin, providerError);
  }

  const transaction = await readLoginTransaction();
  if (!transaction) {
    return back(origin, "expired");
  }

  let identity;
  try {
    identity = await completeLogin(currentUrl, transaction);
  } catch {
    return back(origin, "exchange_failed");
  }

  const user = await upsertOidcUser(identity);
  const { token, expiresAt } = await createSession(user.id);

  await recordAudit({
    actor: user.id,
    action: "auth.login",
    targetType: "user",
    targetId: user.id,
    targetName: user.name,
    ip: clientIp(request),
  });

  const response = NextResponse.redirect(
    appUrl(origin, safeReturn(origin, transaction.returnTo)),
  );
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return clearTransaction(response);
}

/** Redirect back to /login carrying an error code, clearing any transaction. */
function back(origin: string, error: string): NextResponse {
  const url = appUrl(origin, "/login");
  url.searchParams.set("error", error);
  return clearTransaction(NextResponse.redirect(url));
}

/**
 * Build a public URL for an in-app path against `origin`, prefixing the base
 * path (e.g. "/admin") when the path doesn't already carry it.
 */
function appUrl(origin: string, path: string): URL {
  const basePath = process.env.HEADTOWER_BASE_PATH?.trim() || "";
  let p = path.startsWith("/") ? path : `/${path}`;
  if (basePath && p !== basePath && !p.startsWith(`${basePath}/`)) {
    p = p === "/" ? `${basePath}/` : `${basePath}${p}`;
  }
  return new URL(p, origin);
}

/** Expire the login-transaction cookies on the outgoing response. */
function clearTransaction(response: NextResponse): NextResponse {
  for (const name of LOGIN_TRANSACTION_COOKIES) response.cookies.delete(name);
  return response;
}

/**
 * Only honour a same-app return path; otherwise land on the console root.
 * "//host" and "/\host" both resolve to a foreign origin (the browser and
 * `new URL` treat a backslash as a slash), so reject a slash OR backslash right
 * after the leading slash, then confirm it resolves back to our own origin.
 */
function safeReturn(origin: string, value: string | null): string {
  if (!value || !value.startsWith("/")) return "/";
  if (value[1] === "/" || value[1] === "\\") return "/";
  try {
    if (new URL(value, origin).origin !== new URL(origin).origin) return "/";
  } catch {
    return "/";
  }
  return value;
}

/** Best-effort client IP from forwarding headers, for the audit trail. */
function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}
