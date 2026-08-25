/**
 * Request-shape helpers shared by the OIDC sign-in flow (server-only).
 *
 * The OIDC `redirect_uri` must be identical at authorization time and at the
 * token exchange, so both the start action and the callback derive the
 * externally visible origin the same way. Behind a reverse proxy the forwarded
 * headers win over the raw `Host`.
 */

/** Derive the externally visible `scheme://host` origin from request headers. */
export function originFromHeaders(headers: Headers): string {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) {
    throw new Error(
      "Cannot determine the request host; an OIDC redirect URI requires it.",
    );
  }
  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "http";
  return `${proto}://${host}`;
}

/**
 * Re-home a request URL onto the public `origin`, keeping its path and query.
 *
 * Needed because `request.url` in a Route Handler behind a reverse proxy is the
 * internal bind address (`https://0.0.0.0:3000/...`), and the callback URL is
 * not only redirected from - it is also handed to
 * `client.authorizationCodeGrant`, which derives the token request's
 * `redirect_uri` from it. Passing the internal address fails the exchange,
 * because the provider requires that value to be identical to the
 * `redirect_uri` of the authorization request:
 *
 *   "The 'redirect_uri' parameter value 'https://0.0.0.0:3000/login/callback'
 *    utilized in the Access Request does not match the original 'redirect_uri'
 *    parameter value 'https://headtower.example/login/callback' requested in
 *    the Authorize Request which is not permitted."   -- Authelia 4.39
 *
 * The path is carried over verbatim, so a sub-path mount
 * (`HEADTOWER_BASE_PATH`) survives: it is already part of the incoming path.
 */
export function publicRequestUrl(requestUrl: string, origin: string): URL {
  const incoming = new URL(requestUrl);
  return new URL(`${incoming.pathname}${incoming.search}`, origin);
}
