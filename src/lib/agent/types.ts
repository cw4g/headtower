/**
 * Shapes for the optional Headtower agent sidecar.
 *
 * The agent is a separate, fresh Go process that runs alongside Headscale and
 * reports the device-level facts the control plane does not know: operating
 * system, client version, and the discovered network endpoints. Headtower reads
 * it over HTTP at `${HEADTOWER_AGENT_URL}/peers` and merges the result into the
 * machines views. It is strictly enrichment - everything degrades cleanly when
 * no agent is configured or reachable.
 */

/** A single peer as projected from the agent's `/peers` response. */
export interface AgentPeer {
  /** The device's reported hostname; the primary join key to a Headscale node. */
  hostname: string;
  /** Operating system label, e.g. "linux" / "macOS" / "windows". */
  os: string | null;
  /** Tailscale client version string, e.g. "1.78.1". */
  clientVersion: string | null;
  /** Tailnet addresses, used as a fallback join key when hostnames differ. */
  addresses: string[];
  /** Discovered network endpoints (`host:port`) the device is reachable on. */
  endpoints: string[];
}

/**
 * An immutable lookup over the agent's peers, keyed by hostname *and* address so
 * a Headscale node can be matched on either. {@link available} is false when the
 * agent is unconfigured or returned nothing, letting callers branch once.
 */
export interface AgentPeerIndex {
  /** True when the agent returned at least one usable peer. */
  readonly available: boolean;
  /** Resolve a node's enrichment by its hostname or any of its addresses. */
  lookup(
    hostname: string | null | undefined,
    addresses: readonly string[],
  ): AgentPeer | null;
}
