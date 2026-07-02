/**
 * Pure helpers for interpreting Headscale policy reference tokens - the strings
 * that appear in acl/ssh `src` and `dst`, group members, tag owners, and so on.
 *
 * Shared by the advisory linter ({@link ./lint}) and the reachability evaluator
 * ({@link ./eval}). Isomorphic and dependency-free: no server imports, no React.
 */

/** The syntactic shape of a reference token, ignoring any trailing port spec. */
export type TokenKind =
  | "wildcard" // *
  | "group" // group:name
  | "tag" // tag:name
  | "autogroup" // autogroup:name
  | "host" // matches a declared host alias name
  | "cidr" // a bare IP or CIDR
  | "user" // an email-like user reference
  | "literal"; // a bare word (unresolved host alias or plain username)

/** A destination token split into its target and optional port spec. */
export interface DstParts {
  /** The destination reference (host/tag/group/cidr/…), without ports. */
  host: string;
  /** The port spec (`*`, `22`, `80,443`, `8000-8080`) or null when absent. */
  ports: string | null;
}

const PORT_SPEC = /^(\*|\d+(-\d+)?)(,(\*|\d+(-\d+)?))*$/;

/**
 * Split a destination token like `tag:prod:22,443` into its reference (`tag:prod`)
 * and its port spec (`22,443`). Ports live after the final colon, so we only peel
 * a trailing segment off when it actually looks like a port list - otherwise the
 * whole token is the reference (e.g. a bare `group:eng`, or an IPv6 literal).
 */
export function splitDstPorts(token: string): DstParts {
  const idx = token.lastIndexOf(":");
  if (idx > 0) {
    const tail = token.slice(idx + 1);
    if (PORT_SPEC.test(tail)) {
      return { host: token.slice(0, idx), ports: tail };
    }
  }
  return { host: token, ports: null };
}

/** True when `ip` is a syntactically plausible IPv4 or IPv6 address/CIDR. */
export function looksLikeCidr(token: string): boolean {
  const [addr, mask] = token.split("/");
  if (mask !== undefined && !/^\d{1,3}$/.test(mask)) return false;
  if (parseIpv4(addr) !== null) return true;
  // Coarse IPv6 check: hex groups and at least one colon.
  return /^[0-9a-fA-F:]+$/.test(addr) && addr.includes(":");
}

/**
 * Classify a reference token (already stripped of any port spec). `hostAliases`
 * is the set of declared host-alias names, so a bare word that names a host is
 * recognised as such rather than guessed to be a user.
 */
export function classifyToken(
  token: string,
  hostAliases: ReadonlySet<string>,
): TokenKind {
  if (token === "*") return "wildcard";
  if (token.startsWith("group:")) return "group";
  if (token.startsWith("tag:")) return "tag";
  if (token.startsWith("autogroup:")) return "autogroup";
  if (hostAliases.has(token)) return "host";
  if (looksLikeCidr(token)) return "cidr";
  if (token.includes("@")) return "user";
  return "literal";
}

/* ------------------------------- IPv4 CIDR -------------------------------- */

/** A parsed IPv4 range: 32-bit network base plus prefix length. */
export interface Ipv4Range {
  base: number; // network address, masked
  bits: number; // prefix length 0-32
}

/** Parse a dotted-quad IPv4 address to a 32-bit unsigned int, or null. */
export function parseIpv4(addr: string): number | null {
  const parts = addr.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value >>> 0;
}

/** Parse an IPv4 address or CIDR (`10.0.0.0/24`, bare `1.2.3.4` = /32). */
export function parseIpv4Range(token: string): Ipv4Range | null {
  const [addr, mask] = token.split("/");
  const ip = parseIpv4(addr);
  if (ip === null) return null;
  let bits = 32;
  if (mask !== undefined) {
    if (!/^\d{1,2}$/.test(mask)) return null;
    bits = Number(mask);
    if (bits > 32) return null;
  }
  const maskBits = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { base: (ip & maskBits) >>> 0, bits };
}

/** True when two IPv4 ranges overlap (one contains the other's network). */
export function ipv4RangesOverlap(a: Ipv4Range, b: Ipv4Range): boolean {
  const bits = Math.min(a.bits, b.bits);
  const maskBits = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((a.base & maskBits) >>> 0) === ((b.base & maskBits) >>> 0);
}

/** True when a concrete port number falls within a Headscale port spec. */
export function portMatches(spec: string | null, port: number | null): boolean {
  // No requested port means "any port"; a rule with no spec means "all ports".
  if (port === null) return true;
  if (spec === null || spec === "*") return true;
  for (const part of spec.split(",")) {
    if (part === "*") return true;
    const [lo, hi] = part.split("-");
    const low = Number(lo);
    const high = hi === undefined ? low : Number(hi);
    if (Number.isFinite(low) && port >= low && port <= high) return true;
  }
  return false;
}
