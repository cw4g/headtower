/**
 * Headtower agent reader (server-only).
 *
 * When the agent is configured and enabled (see {@link agentBaseUrl}),
 * {@link getAgentPeers} fetches the sidecar's `/peers` JSON, projects it into a
 * tolerant {@link AgentPeer} list, and returns an index keyed by hostname +
 * address. {@link getAgentHealth} hits its `/healthz` liveness probe for the
 * settings UI. The agent is optional enrichment, so both reads are deliberately
 * forgiving: a short timeout, no throwing, and a quiet "unavailable" result on
 * any miss (unset/disabled, network error, bad status, unparseable body).
 * Callers merge whatever comes back and render the same either way.
 *
 * SERVER-ONLY: reads `@/lib/config` (and so `node:sqlite`) and talks to the
 * sidecar directly. Import it from Server Components / Server Actions, never
 * from a client component.
 */

import { getConfig } from "@/lib/config";
import type { AgentPeer, AgentPeerIndex } from "./types";

export type { AgentPeer, AgentPeerIndex } from "./types";

/** Agents are local sidecars; a read should never hold up a page render. */
const AGENT_TIMEOUT_MS = 2_000;

/** A shared empty index for the "no agent" path - same surface, nothing in it. */
const EMPTY_INDEX: AgentPeerIndex = {
  available: false,
  lookup: () => null,
};

/**
 * The configured agent base URL (trailing slash trimmed), or null when unset
 * or explicitly disabled (`agent.enabled === false`). Config value wins over
 * the raw env var - see `@/lib/config` for the env fallback + DB override.
 */
function agentBaseUrl(): string | null {
  const agent = getConfig().agent;
  if (agent?.enabled === false) return null;
  const raw = agent?.url?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .map((item) => item.trim());
}

/** First non-empty string among the given keys. */
function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = asString(obj[key]);
    if (value) return value;
  }
  return null;
}

/** First non-empty string array among the given keys. */
function pickStringArray(obj: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = asStringArray(obj[key]);
    if (value.length > 0) return value;
  }
  return [];
}

/**
 * Project one raw entry into an {@link AgentPeer}, tolerating a few common field
 * spellings. Returns null when there is no key at all (neither hostname nor any
 * address), since such an entry can never be matched to a node.
 */
function normalizePeer(raw: unknown): AgentPeer | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const hostname = pickString(obj, ["hostname", "host", "name"]);
  const addresses = pickStringArray(obj, [
    "addresses",
    "ipAddresses",
    "tailscaleIPs",
    "ips",
  ]);
  if (!hostname && addresses.length === 0) return null;

  return {
    hostname: hostname ?? "",
    os: pickString(obj, ["os", "OS", "osVersion"]),
    clientVersion: pickString(obj, ["clientVersion", "version", "tailscaleVersion"]),
    addresses,
    endpoints: pickStringArray(obj, ["endpoints", "endpoint"]),
  };
}

/** Accept either a bare array or a `{ peers: [...] }` envelope. */
function parsePeers(json: unknown): AgentPeer[] {
  let list: unknown[] = [];
  if (Array.isArray(json)) {
    list = json;
  } else if (json && typeof json === "object") {
    const maybe = (json as Record<string, unknown>).peers;
    if (Array.isArray(maybe)) list = maybe;
  }

  const peers: AgentPeer[] = [];
  for (const item of list) {
    const peer = normalizePeer(item);
    if (peer) peers.push(peer);
  }
  return peers;
}

/** Build the hostname + address index from a parsed peer list. */
function indexPeers(peers: AgentPeer[]): AgentPeerIndex {
  if (peers.length === 0) return EMPTY_INDEX;

  const byHostname = new Map<string, AgentPeer>();
  const byAddress = new Map<string, AgentPeer>();
  for (const peer of peers) {
    if (peer.hostname) byHostname.set(peer.hostname.toLowerCase(), peer);
    for (const address of peer.addresses) byAddress.set(address, peer);
  }

  return {
    available: true,
    lookup(hostname, addresses) {
      const host = hostname?.toLowerCase();
      if (host) {
        const byHost = byHostname.get(host);
        if (byHost) return byHost;
      }
      for (const address of addresses) {
        const byAddr = byAddress.get(address);
        if (byAddr) return byAddr;
      }
      return null;
    },
  };
}

/**
 * Fetch and index the agent's peers. Resolves to an empty index whenever the
 * agent is unconfigured or unreachable - it never throws, so a missing sidecar
 * is invisible to the caller beyond `index.available === false`.
 */
export async function getAgentPeers(): Promise<AgentPeerIndex> {
  const base = agentBaseUrl();
  if (!base) return EMPTY_INDEX;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}/peers`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      // Live device state; never serve a cached read into the console.
      cache: "no-store",
    });
    if (!response.ok) return EMPTY_INDEX;
    const json: unknown = await response.json();
    return indexPeers(parsePeers(json));
  } catch {
    // Fail quiet: a flaky/absent sidecar must not degrade the machines view.
    return EMPTY_INDEX;
  } finally {
    clearTimeout(timer);
  }
}

/** A liveness result for the settings UI. Never throws; unreachable is a value. */
export interface AgentHealth {
  reachable: boolean;
  status?: string;
  service?: string;
  latencyMs?: number;
  error?: string;
}

/**
 * Probe the agent's `/healthz`. Returns a plain result the settings panel can
 * render: reachable with the reported service/status and a round-trip time, or
 * `reachable: false` with a short reason when the agent is unset, turned off, or
 * unreachable. Same short timeout and fail-quiet contract as {@link getAgentPeers}.
 */
export async function getAgentHealth(): Promise<AgentHealth> {
  const base = agentBaseUrl();
  if (!base) {
    const disabled = getConfig().agent?.enabled === false;
    return {
      reachable: false,
      error: disabled ? "Agent is turned off" : "No agent URL is configured",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(`${base}/healthz`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    const latencyMs = Date.now() - startedAt;
    if (!response.ok) {
      return {
        reachable: false,
        latencyMs,
        error: `Agent returned HTTP ${response.status}`,
      };
    }
    const json: unknown = await response.json();
    const body =
      json && typeof json === "object" ? (json as Record<string, unknown>) : {};
    return {
      reachable: true,
      latencyMs,
      service: asString(body.service) ?? undefined,
      status: asString(body.status) ?? undefined,
    };
  } catch {
    return { reachable: false, error: "Agent is unreachable" };
  } finally {
    clearTimeout(timer);
  }
}
