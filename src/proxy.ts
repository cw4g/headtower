/**
 * Route gate (Next.js 16 Proxy - formerly Middleware).
 *
 * In Next.js 16 the `middleware` convention was renamed to `proxy`; this file is
 * the request boundary that runs before the app. It performs an OPTIMISTIC auth
 * check only: when OIDC mode is on and a request for an app route arrives without
 * a validly-signed `ht_session` cookie, it redirects to `/login`. It never
 * touches the database - the secure check (session row + account) is done by
 * `getSession()` inside Server Components and Server Actions.
 *
 * It deliberately imports only the jose-light token helpers (no db, no Next
 * request APIs beyond `next/server`), keeping the boundary lean as the proxy
 * docs advise. In operator mode (OIDC unset) it is a pass-through, so the app
 * keeps working with just HEADSCALE_API_KEY.
 */

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session-token";

/** Paths always allowed through without a session (the sign-in surface itself). */
const PUBLIC_PREFIXES = ["/login"];

/**
 * OIDC mode is active only when all three provider vars are present, mirroring
 * the all-or-nothing rule in `@/lib/config`. Read here directly to keep the
 * proxy free of heavier imports.
 */
function oidcModeEnabled(): boolean {
  return Boolean(
    process.env.HEADTOWER_OIDC_ISSUER &&
      process.env.HEADTOWER_OIDC_CLIENT_ID &&
      process.env.HEADTOWER_OIDC_CLIENT_SECRET,
  );
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  // Operator mode: no sessions, nothing to gate.
  if (!oidcModeEnabled()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const payload = token ? await verifySessionToken(token) : null;
  if (payload) return NextResponse.next();

  // No valid session: send to /login, remembering where they were headed.
  const loginUrl = new URL("/login", request.nextUrl);
  const returnTo = pathname + request.nextUrl.search;
  if (returnTo && returnTo !== "/") loginUrl.searchParams.set("next", returnTo);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on everything except API routes, Next internals, and static asset files
  // (any path containing a dot). App routes and /login carry no dot, so match.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
