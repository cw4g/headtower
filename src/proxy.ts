/**
 * Route gate (Next.js 16 Proxy - formerly Middleware).
 *
 * In Next.js 16 the `middleware` convention was renamed to `proxy`; this file is
 * the request boundary that runs before the app. This is the AUTHORITATIVE
 * gate: when single sign-on is on (any identity provider enabled - the legacy
 * single-provider slot or any `oidc_provider` row, see
 * `@/lib/auth/oidc`'s {@link isOidcEnabled}) and a request for an app route
 * arrives without a validly-signed `ht_session` cookie, it redirects to
 * `/login` BEFORE any Server Component starts rendering.
 *
 * That "before rendering starts" property is load-bearing, not a style choice:
 * a redirect() call inside a layout Server Component (e.g. the app shell) does
 * NOT stop sibling/child route segments from having already run their own data
 * fetches - Next.js resolves a route's `children` tree concurrently with its
 * layouts, so an unauthenticated request could still receive a page's fetched
 * data serialized into the redirect response's RSC payload even though the
 * browser itself only ever follows the Location header and never renders it.
 * Gating here, before the route tree is built at all, closes that hole; relying
 * on a Server Component redirect alone does not.
 *
 * Proxy defaults to the Node.js runtime in Next.js 16 (not Edge), so it can
 * read the same synchronous, `node:sqlite`-backed config/provider store every
 * other server module uses - no separate env-only approximation needed here.
 *
 * `getSession()` (used inside Server Components and Server Actions) remains
 * the second, secure check: it additionally validates the session row still
 * exists (e.g. wasn't revoked from Settings > Members or the account page).
 *
 * The NEEDS-SETUP gate (redirect to /setup when no Headscale connection is
 * configured) stays in the app-shell, not here - /setup must stay reachable
 * even before sign-in, and this file's job for it is only to keep that path
 * public.
 */

import { NextResponse, type NextRequest } from "next/server";
import { isOidcEnabled } from "@/lib/auth/oidc";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session-token";

/**
 * Paths always allowed through without a session: the sign-in surface and the
 * first-run setup wizard (which must load before anything is configured).
 */
const PUBLIC_PREFIXES = ["/login", "/setup"];

export async function proxy(request: NextRequest): Promise<NextResponse> {
  // Operator mode: no sessions, nothing to gate.
  if (!isOidcEnabled()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const payload = token ? await verifySessionToken(token) : null;
  if (payload) return NextResponse.next();

  // No valid session: send to /login, remembering where they were headed.
  // Next strips the configured basePath (HEADTOWER_BASE_PATH, e.g. /admin) from
  // `pathname` here and does NOT re-add it to a redirect we build ourselves, so
  // prepend it by hand - otherwise the Location is a bare `/login` that lands
  // outside the app mount (a 404 from whatever else serves the root path). Read
  // it from the env (as login/callback does), the authoritative runtime source.
  const basePath = process.env.HEADTOWER_BASE_PATH?.trim() || "";
  const loginUrl = new URL(`${basePath}/login`, request.nextUrl);
  const returnTo = basePath + pathname + request.nextUrl.search;
  if (returnTo && returnTo !== "/" && returnTo !== `${basePath}/`) {
    loginUrl.searchParams.set("next", returnTo);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on everything except API routes, Next internals, and static asset files
  // (any path containing a dot). App routes and /login carry no dot, so match.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
