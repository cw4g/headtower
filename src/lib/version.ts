/**
 * Build version + update check (server-only).
 *
 * `APP_VERSION` and `BUILD_SHA` identify what's actually running: the version
 * comes bundled from `package.json` at build time; the SHA is passed in as a
 * build arg (`HEADTOWER_GIT_SHA`, see the Dockerfile's runner stage) since the
 * container has no `.git` of its own to read it from.
 *
 * `checkForUpdate` compares that against `version.json`, a tiny public file
 * published by the docs site's deploy workflow on every push to `main` (see
 * `.github/workflows/deploy-docs.yml`) - a plain, unauthenticated static file
 * works here specifically because the app repo is private (no token this app
 * ships can safely call the GitHub API with), while the docs site itself is
 * already public at headtower.niheshr.com. Fails quiet on any error (offline,
 * DNS, malformed JSON): "no update known" is the safe default, never a crash.
 * Cached in memory for a few hours so a check doesn't run on every request.
 */

import pkg from "../../package.json" with { type: "json" };

export const APP_VERSION: string = pkg.version;

/** The commit this build was made from, or null when not passed at build time. */
export const BUILD_SHA: string | null =
  process.env.HEADTOWER_GIT_SHA?.trim() || null;

const DEFAULT_VERSION_URL = "https://headtower.niheshr.com/version.json";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const FETCH_TIMEOUT_MS = 3_000;

/**
 * Resolve where -- and whether -- to look for the published version.
 *
 * Both knobs exist for deployments the default cannot serve honestly. A build
 * carrying its own version (a fork, a patched image) compares against a
 * `version.json` that describes a *different* codebase, so the indicator claims
 * an update forever and may even point downhill; an air-gapped install cannot
 * reach the URL at all. Saying nothing beats saying something untrue.
 *
 * Unset variables keep the previous behaviour exactly. The environment is
 * injectable so the precedence is testable without reloading the module.
 */
export function updateCheckConfig(
  env: Record<string, string | undefined> = process.env,
): { enabled: boolean; url: string } {
  const enabled =
    (env.HEADTOWER_UPDATE_CHECK ?? "").trim().toLowerCase() !== "false";
  const url = env.HEADTOWER_VERSION_URL?.trim() || DEFAULT_VERSION_URL;
  return { enabled, url };
}

interface RemoteVersion {
  version: string;
  sha: string;
}

export interface UpdateCheck {
  available: boolean;
  latestVersion: string | null;
}

let cached: { checkedAt: number; result: UpdateCheck } | null = null;

/** Best-effort check against the published version.json. Never throws. */
export async function checkForUpdate(): Promise<UpdateCheck> {
  if (cached && Date.now() - cached.checkedAt < CHECK_INTERVAL_MS) {
    return cached.result;
  }

  const result = await fetchLatest();
  cached = { checkedAt: Date.now(), result };
  return result;
}

async function fetchLatest(): Promise<UpdateCheck> {
  const none: UpdateCheck = { available: false, latestVersion: null };
  const { enabled, url } = updateCheckConfig();
  if (!enabled) return none;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return none;
    const json = (await response.json()) as Partial<RemoteVersion>;
    if (typeof json.version !== "string") return none;

    // Compare the published semver against the running one. A SHA compare would
    // be wrong here: deploy-docs.yml rewrites version.json's sha on every push
    // to main (docs included), but the image only rebuilds on source changes -
    // so a sha mismatch fires after any docs edit and cries wolf. The version
    // bumps only on a real release, which is exactly when an update exists.
    const available = json.version !== APP_VERSION;
    return { available, latestVersion: json.version };
  } catch {
    return none;
  } finally {
    clearTimeout(timer);
  }
}
