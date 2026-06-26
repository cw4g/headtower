/**
 * DNS resource - Headscale 0.26 - 0.29.
 *
 * IMPORTANT: Headscale exposes NO DNS admin endpoints over the `/api/v1` REST
 * surface in this version range. DNS - MagicDNS, the base domain, global and
 * split nameservers, search domains, and extra records - is configured in the
 * Headscale *server config file* (`dns:` section) and applied at startup. There
 * is no runtime API to read or mutate it.
 *
 * This module therefore exposes no request methods. It exists to (a) make that
 * absence explicit and discoverable rather than a silent gap, and (b) provide
 * typed shapes for the DNS configuration so a future config-file reader / editor
 * (see `src/lib/config/`) and the UI can share one definition.
 *
 * Server-only; see ./client.
 */

/** A static A/AAAA record served by MagicDNS (`dns.extra_records`). */
export interface DNSExtraRecord {
  name: string;
  /** Record type, typically "A" or "AAAA". */
  type: string;
  value: string;
}

/**
 * Split-DNS routing: a map of DNS suffix -> resolver addresses. A resolver list
 * may be empty to explicitly resolve a domain locally.
 */
export type DNSSplitResolvers = Record<string, string[]>;

/**
 * Headscale's DNS configuration, mirroring the server config `dns:` block.
 * Field names follow the config file (not an API response). Read from config,
 * never from the REST API in 0.26 - 0.29.
 */
export interface DNSConfig {
  /** Whether MagicDNS is enabled. */
  magicDns: boolean;
  /** The tailnet base domain, e.g. "tailnet.example.com". */
  baseDomain: string;
  /** Global resolvers applied to all nodes. */
  nameservers: string[];
  /** Per-domain (split) resolvers. */
  splitDns: DNSSplitResolvers;
  /** Additional search domains appended to queries. */
  searchDomains: string[];
  /** Static records served by MagicDNS. */
  extraRecords: DNSExtraRecord[];
  /** Whether Headscale overrides a node's local DNS configuration. */
  overrideLocalDns: boolean;
}

export const dns = {
  /**
   * Headscale 0.26 - 0.29 has no DNS REST endpoints; DNS is server-config
   * driven. This flag lets callers branch without hard-coding the assumption.
   */
  apiAvailable: false as const,
} as const;
