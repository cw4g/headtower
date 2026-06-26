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
