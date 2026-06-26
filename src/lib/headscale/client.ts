/**
 * Headtower's Headscale REST client - request core.
 *
 * SERVER-ONLY. This module reads `HEADSCALE_API_KEY` from the environment and
 * talks to the control plane directly; it must never be imported into a client
 * component or shipped to the browser. The resource modules
 * (`nodes`, `users`, `pre-auth-keys`, `api-keys`, `routes`, `policy`, `dns`)
 * build on the `request()` helper exported here.
 *
 * Surface map (Headscale 0.26 - 0.29 admin API, prefixed with `${HEADSCALE_URL}`):
 *
 *   nodes        GET    /api/v1/node
 *                GET    /api/v1/node/{id}
 *                POST   /api/v1/node/{id}/rename/{name}
 *                POST   /api/v1/node/{id}/tags             { tags }
 *                POST   /api/v1/node/{id}/approve_routes   { routes }
 *                POST   /api/v1/node/{id}/expire
 *                DELETE /api/v1/node/{id}
 *   users        GET    /api/v1/user
 *                POST   /api/v1/user                       { name, displayName?, email?, pictureUrl? }
 *                POST   /api/v1/user/{id}/rename/{name}
 *                DELETE /api/v1/user/{id}
 *   preAuthKeys  GET    /api/v1/preauthkey?user={id}
 *                POST   /api/v1/preauthkey                 { user, reusable?, ephemeral?, expiration?, aclTags? }
 *                POST   /api/v1/preauthkey/expire          { user, key } | { id }
 *                DELETE /api/v1/preauthkey?id={id}         (0.29+)
 *   apiKeys      GET    /api/v1/apikey
 *                POST   /api/v1/apikey                     { expiration? }
 *                POST   /api/v1/apikey/expire              { prefix }
 *                DELETE /api/v1/apikey/{prefix}
 *   policy       GET    /api/v1/policy
 *                PUT    /api/v1/policy                     { policy }
 *
 * `routes` and `dns` have no dedicated endpoints in this version range: route
 * state is projected from node fields + `approve_routes`, and DNS is managed in
 * the Headscale server config. See those modules for details.
 *
 * Every request is authenticated with `Authorization: Bearer ${HEADSCALE_API_KEY}`,
 * never cached, bounded by a ~5s timeout, and fails loud with a typed error.
 */

const DEFAULT_TIMEOUT_MS = 5_000;
const API_PREFIX = "/api";

/** Base class for every error this client raises. */
export class HeadscaleError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "HeadscaleError";
  }
}

/** Thrown when the client is misconfigured (missing/invalid env) or misused. */
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
    super(`Headscale ${method} ${url} returned an unparseable body: ${describeCause(cause)}`, {
      cause,
    });
    this.name = "HeadscaleParseError";
  }
}

type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  /** HTTP method. Defaults to "GET". */
  method?: string;
  /** Query string parameters; `undefined`/`null` values are skipped. */
  query?: Record<string, QueryValue>;
  /** JSON request body. Serialised with `JSON.stringify`; omit for no body. */
  body?: unknown;
  /** Per-request timeout override in milliseconds. Defaults to ~5000. */
  timeoutMs?: number;
  /** Optional caller signal; aborts the request alongside the timeout. */
  signal?: AbortSignal;
}

interface HeadscaleConfig {
  baseUrl: string;
  apiKey: string;
}

/** Reads and validates `HEADSCALE_URL` / `HEADSCALE_API_KEY` at call time. */
function getConfig(): HeadscaleConfig {
  const rawUrl = process.env.HEADSCALE_URL;
  const apiKey = process.env.HEADSCALE_API_KEY;

  if (!rawUrl) {
    throw new HeadscaleConfigError(
      "HEADSCALE_URL is not set. Point it at your Headscale server, e.g. https://headscale.example.com",
    );
  }
  if (!apiKey) {
    throw new HeadscaleConfigError(
      "HEADSCALE_API_KEY is not set. Generate one with `headscale apikeys create`.",
    );
  }

  // Normalise: drop trailing slashes so we can append `/api/v1/...` cleanly.
  const baseUrl = rawUrl.replace(/\/+$/, "");
  try {
    // Validate it is an absolute URL we can build on.
    new URL(baseUrl);
  } catch {
    throw new HeadscaleConfigError(
      `HEADSCALE_URL is not a valid absolute URL: ${JSON.stringify(rawUrl)}`,
    );
  }

  return { baseUrl, apiKey };
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, QueryValue>,
): string {
  // Resource modules pass paths beginning with `/v1/...`; the gateway lives
  // under `/api`, so the full path is `${baseUrl}/api/v1/...`.
  const url = new URL(`${baseUrl}${API_PREFIX}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

/** Pulls a human-readable detail + gRPC code out of a gateway error body. */
function parseErrorBody(body: string): { detail?: string; code?: number } {
  if (!body) return {};
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const detail =
        typeof obj.message === "string"
          ? obj.message
          : typeof obj.error === "string"
            ? obj.error
            : undefined;
      const code = typeof obj.code === "number" ? obj.code : undefined;
      return { detail, code };
    }
  } catch {
    // Not JSON; fall back to the raw text, trimmed to something readable.
  }
  const trimmed = body.trim();
  return trimmed ? { detail: trimmed.slice(0, 500) } : {};
}

/**
 * Performs a single authenticated request against the Headscale admin API and
 * returns the parsed JSON body as `T`. Empty `2xx` bodies resolve to
 * `undefined`. All failure modes throw a typed {@link HeadscaleError}.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  // Hard server-only guard: this module must never run in the browser, where
  // it would leak the API key into the client bundle.
  if (typeof window !== "undefined") {
    throw new HeadscaleConfigError(
      "The Headscale client is server-only and must not be imported into client components.",
    );
  }

  const { baseUrl, apiKey } = getConfig();
  const method = (options.method ?? "GET").toUpperCase();
  const url = buildUrl(baseUrl, path, options.query);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timedOut = { value: false };
  const timer = setTimeout(() => {
    timedOut.value = true;
    controller.abort();
  }, timeoutMs);

  // Abort if the caller's signal fires too.
  const onExternalAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };
  const hasBody = options.body !== undefined;
  if (hasBody) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: hasBody ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      // Headscale is the source of truth for live tailnet state; never serve
      // a stale cached read from an admin console.
      cache: "no-store",
    });
  } catch (cause) {
    if (timedOut.value) {
      throw new HeadscaleTimeoutError(method, url, timeoutMs);
    }
    if (options.signal?.aborted) {
      throw new HeadscaleError(`Headscale ${method} ${url} was aborted`, { cause });
    }
    throw new HeadscaleNetworkError(method, url, cause);
  } finally {
    clearTimeout(timer);
    if (options.signal) options.signal.removeEventListener("abort", onExternalAbort);
  }

  const text = await response.text();

  if (!response.ok) {
    const { detail, code } = parseErrorBody(text);
    throw new HeadscaleRequestError({
      status: response.status,
      statusText: response.statusText,
      method,
      url,
      body: text,
      code,
      detail,
    });
  }

  // Several endpoints (deletes, expiry, set-tags-with-empty-result) reply with
  // an empty object or empty body. Treat an empty body as "no content".
  if (text.length === 0) return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch (cause) {
    throw new HeadscaleParseError(method, url, cause);
  }
}
