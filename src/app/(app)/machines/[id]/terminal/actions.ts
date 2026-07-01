"use server";

/**
 * Server Action minting short-lived access tokens for the browser SSH
 * terminal (`SshTerminal`, see `@/components/terminal/ssh-terminal`).
 *
 * The terminal never talks to the Headtower agent's websocket directly with a
 * long-lived secret - it asks the server for a one-time, 60s-lived token, then
 * opens the websocket itself with that token in the URL. This keeps
 * `HEADTOWER_AGENT_SSH_SECRET` server-only.
 *
 * Token shape, MUST match the agent (see `agent/ssh.go` `verifySSHToken`):
 *
 *   base64url(payloadJSON) + "." + base64url(HMAC_SHA256(payloadJSON, secret))
 *
 * Both segments are UNPADDED base64url (Node's `"base64url"` buffer encoding
 * already omits padding). The HMAC is computed over the exact payload bytes
 * that were encoded into the first segment.
 */

import { createHmac } from "node:crypto";
import { audit, authorize } from "@/lib/authz";

/** Token validity window. Long enough to open the socket, short enough to
 *  make a leaked token (e.g. in a proxy access log) low-value. */
const TOKEN_TTL_SECONDS = 60;

export type MintSshTokenResult =
  | { ok: true; token: string; path: string }
  | { ok: false; error: string };

/**
 * Mint a signed `/ssh` access token for `user@host`, gated on the
 * `ssh.connect` capability. Returns the websocket path the client should
 * connect to alongside the token - never the raw secret.
 */
export async function mintSshToken(
  host: string,
  user: string,
): Promise<MintSshTokenResult> {
  const gate = await authorize("ssh.connect");
  if (!gate.ok) {
    return { ok: false, error: gate.reason };
  }

  const trimmedHost = host.trim();
  const trimmedUser = user.trim();
  if (!trimmedHost) {
    return { ok: false, error: "No hostname or address to connect to." };
  }
  if (!trimmedUser) {
    return { ok: false, error: "Enter an SSH user." };
  }

  const secret = process.env.HEADTOWER_AGENT_SSH_SECRET?.trim();
  if (!secret) {
    return {
      ok: false,
      error:
        "The SSH terminal isn't enabled: HEADTOWER_AGENT_SSH_SECRET is not configured on the server.",
    };
  }

  const payload = JSON.stringify({
    host: trimmedHost,
    user: trimmedUser,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  });
  const payloadBytes = Buffer.from(payload, "utf8");
  const signature = createHmac("sha256", secret).update(payloadBytes).digest();
  const token = `${payloadBytes.toString("base64url")}.${signature.toString("base64url")}`;

  // targetId is intentionally omitted: `host` is a hostname/tailnet IP, not
  // the Headscale node id, so recording it there would produce a broken
  // "/machines/<host>" link on the audit page (see `targetHref`).
  await audit(gate.session, {
    action: "ssh.connect",
    targetType: "node",
    targetName: `${trimmedUser}@${trimmedHost}`,
    detail: { host: trimmedHost, user: trimmedUser },
  });

  const basePath = process.env.HEADTOWER_BASE_PATH?.trim() || "";
  return { ok: true, token, path: `${basePath}/agent/ssh` };
}
