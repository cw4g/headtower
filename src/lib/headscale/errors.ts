/**
 * Headscale client error types - a PURE module (no node/db imports).
 *
 * These classes are split out from the request core (./client) so they can be
 * imported anywhere, including client components that render an error (e.g. the
 * console's error boundary). Importing them from ./client instead would drag the
 * whole request core - which reaches the config + database layers, and so
 * `node:sqlite` - into the browser bundle and break the build.
 *
 * ./client re-exports these, so server-side callers can keep importing them from
 * `@/lib/headscale` unchanged.
 */

/** Base class for every error the Headscale client raises. */
export class HeadscaleError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "HeadscaleError";
  }
}

/** Thrown when the client is misconfigured (missing/invalid connection) or misused. */
export class HeadscaleConfigError extends HeadscaleError {
  constructor(message: string) {
    super(message);
    this.name = "HeadscaleConfigError";
  }
}

/** Thrown when the request exceeds the timeout and is aborted. */
export class HeadscaleTimeoutError extends HeadscaleError {
  readonly timeoutMs: number;
  constructor(method: string, url: string, timeoutMs: number) {
    super(`Headscale ${method} ${url} timed out after ${timeoutMs}ms`);
    this.name = "HeadscaleTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/** Thrown when the request never reached the server (DNS/TLS/connection error). */
export class HeadscaleNetworkError extends HeadscaleError {
  constructor(method: string, url: string, cause: unknown) {
    super(`Headscale ${method} ${url} failed to connect: ${describeCause(cause)}`, {
      cause,
    });
    this.name = "HeadscaleNetworkError";
  }
}

/** Thrown when Headscale answers with a non-2xx status. */
export class HeadscaleRequestError extends HeadscaleError {
  readonly status: number;
  readonly statusText: string;
  readonly method: string;
  readonly url: string;
  /** Raw response body text, for diagnostics. */
  readonly body: string;
  /** gRPC status code from the gateway error envelope, when present. */
  readonly code?: number;

  constructor(args: {
    status: number;
    statusText: string;
    method: string;
    url: string;
    body: string;
    code?: number;
    detail?: string;
  }) {
    const suffix = args.detail ? ` - ${args.detail}` : "";
    super(
      `Headscale ${args.method} ${args.url} failed: ${args.status} ${args.statusText}${suffix}`,
    );
    this.name = "HeadscaleRequestError";
    this.status = args.status;
    this.statusText = args.statusText;
    this.method = args.method;
    this.url = args.url;
    this.body = args.body;
    this.code = args.code;
  }
}

/** Thrown when a 2xx response body is present but is not valid JSON. */
export class HeadscaleParseError extends HeadscaleError {
  constructor(method: string, url: string, cause: unknown) {
    super(
      `Headscale ${method} ${url} returned an unparseable body: ${describeCause(cause)}`,
      { cause },
    );
    this.name = "HeadscaleParseError";
  }
}

/** Best-effort human string for an unknown thrown cause. */
export function describeCause(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}
