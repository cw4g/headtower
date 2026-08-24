/**
 * A pure, honest reachability evaluator for the Headscale/Tailscale ACL model.
 *
 * Given a parsed policy and a single (source -> destination[:port]) question, it
 * decides ALLOW or DENY under standard ACL semantics: default-deny, with a match
 * requiring some `accept` rule whose `src` covers the source *and* whose `dst`
 * covers the destination and port. Membership is expanded (groups -> their users,
 * host aliases -> their CIDRs) and IPv4 CIDRs are matched by range overlap.
 *
 * It is deliberately honest about its limits: constructs it can't fully reason
 * about (most `autogroup:*` forms, `autogroup:internet` against a concrete IP,
 * IPv6 ranges, a `proto` narrower than the question, and `grants` entirely) are
 * reported as `notes` rather than guessed. Isomorphic and dependency-free.
 */

import type { AclRule, PolicyModel } from "./model";
import {
  classifyToken,
  ipv4RangesOverlap,
  parseIpv4Range,
  portMatches,
  splitDstPorts,
  type Ipv4Range,
} from "./tokens";

/** A reachability question. `src`/`dst` are single selector tokens. */
export interface EvalQuery {
  /** Source selector: a user, group:, tag:, host alias, CIDR, or `*`. */
  src: string;
  /** Destination selector: same vocabulary as `src`. */
  dst: string;
  /** Optional destination port to test (e.g. 22). Omitted = any port. */
  port?: number | null;
  /** Optional L4 protocol (tcp/udp/icmp). Omitted/`any` = any protocol. */
  protocol?: string | null;
}

/** The rule (and specific entries) that produced an ALLOW. */
export interface EvalMatch {
  /** Index into `model.acls`. */
  ruleIndex: number;
  src: string[];
  dst: string[];
  /** The `src` entry that covered the source. */
  matchedSrc: string;
  /** The `dst` entry that covered the destination. */
  matchedDst: string;
}

/** The outcome of {@link evaluateReachability}. */
export interface EvalResult {
  decision: "allow" | "deny";
  /** Present only on an allow. */
  match: EvalMatch | null;
  /** Honest caveats: constructs encountered but not fully evaluated. */
  notes: string[];
}

/** The expanded meaning of a selector: literal atoms plus IPv4 ranges. */
interface Expansion {
  /** True when the selector denotes everything (`*`). */
  wildcard: boolean;
  /** Opaque identity/device keys: `u:…`, tag tokens, `lit:…`, `autogroup:…`. */
  atoms: Set<string>;
  /** IPv4 ranges the selector denotes. */
  nets: Ipv4Range[];
}

function emptyExpansion(): Expansion {
  return { wildcard: false, atoms: new Set(), nets: [] };
}

/** Expand a single selector token into its atoms/ranges, collecting caveats. */
function expand(
  token: string,
  model: PolicyModel,
  hostAliases: ReadonlySet<string>,
  notes: Set<string>,
  seenGroups: Set<string>,
): Expansion {
  const out = emptyExpansion();
  if (token === "") return out;
  const kind = classifyToken(token, hostAliases);

  switch (kind) {
    case "wildcard":
      out.wildcard = true;
      return out;

    case "group": {
      // The group token itself is an atom, so two references to the same group
      // match even when it has no members yet. Members expand too, so a user (or
      // nested group) reference on the other side still intersects.
      out.atoms.add(token);
      if (seenGroups.has(token)) return out; // guard cyclic group refs
      seenGroups.add(token);
      const group = model.groups.find((g) => g.name === token);
      if (!group) return out; // undeclared - the linter flags this
      for (const member of group.values) {
        merge(out, expand(member, model, hostAliases, notes, seenGroups));
      }
      return out;
    }

    case "tag":
      out.atoms.add(token);
      return out;

    case "host": {
      const host = model.hosts.find((h) => h.name === token);
      if (host?.cidr) {
        merge(out, expand(host.cidr, model, hostAliases, notes, seenGroups));
      }
      return out;
    }

    case "cidr": {
      const range = parseIpv4Range(token);
      if (range) {
        out.nets.push(range);
      } else {
        // IPv6 or unparseable: fall back to literal equality, and say so.
        out.atoms.add(`lit:${token}`);
        notes.add(`IPv6 range "${token}" is matched only by exact text.`);
      }
      return out;
    }

    case "autogroup":
      if (token === "autogroup:internet") {
        out.atoms.add(token);
        notes.add(
          "autogroup:internet is matched only against autogroup:internet, not against concrete public IPs.",
        );
      } else {
        notes.add(`${token} is not evaluated; results may be incomplete.`);
      }
      return out;

    case "user":
      out.atoms.add(`u:${token.toLowerCase()}`);
      return out;

    case "literal":
    default:
      // A bare word: an unresolved host alias or a plain username. Match by
      // literal equality against the same form on the other side.
      out.atoms.add(`lit:${token}`);
      return out;
  }
}

function merge(into: Expansion, from: Expansion): void {
  if (from.wildcard) into.wildcard = true;
  for (const a of from.atoms) into.atoms.add(a);
  for (const n of from.nets) into.nets.push(n);
}

/** True when a query selector and a rule entry denote overlapping principals. */
function covers(query: Expansion, entry: Expansion): boolean {
  // A `*` on either side is "all", so any non-empty selector on the other side
  // (or another `*`) intersects it.
  if (query.wildcard || entry.wildcard) return true;
  for (const a of query.atoms) {
    if (entry.atoms.has(a)) return true;
  }
  for (const qn of query.nets) {
    for (const en of entry.nets) {
      if (ipv4RangesOverlap(qn, en)) return true;
    }
  }
  return false;
}

const PROTO_ALIASES: Record<string, string> = {
  tcp: "6",
  udp: "17",
  icmp: "1",
  "6": "6",
  "17": "17",
  "1": "1",
};

function normalizeProto(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const key = String(value).trim().toLowerCase();
  if (key === "" || key === "any" || key === "*") return null;
  return PROTO_ALIASES[key] ?? key;
}

/**
 * Does `rule` permit the requested protocol? A rule with no `proto` covers all
 * protocols. When the rule narrows the protocol and the question asks a specific
 * (different) one, it's a miss. When the question is "any", any protocol the rule
 * allows still counts as reachable.
 */
function protoOk(rule: AclRule, wanted: string | null): boolean {
  const ruleProto = normalizeProto(rule.raw?.proto);
  if (ruleProto === null) return true; // rule covers every protocol
  if (wanted === null) return true; // "any" - the rule's protocol suffices
  return ruleProto === wanted;
}

/**
 * Evaluate one reachability question against the policy. Default-deny: returns
 * `allow` with the first matching `accept` rule, else `deny`. Honest notes carry
 * any constructs that couldn't be fully evaluated.
 */
export function evaluateReachability(
  model: PolicyModel,
  query: EvalQuery,
): EvalResult {
  const notes = new Set<string>();
  const hostAliases = new Set(model.hosts.map((h) => h.name).filter(Boolean));

  if (query.src.trim() === "" || query.dst.trim() === "") {
    return {
      decision: "deny",
      match: null,
      notes: ["Pick both a source and a destination to evaluate."],
    };
  }

  // Grants are not evaluated, and that matters more than it sounds: a policy
  // migrated fully to grants has an empty `acls`, so every question would answer
  // "deny" without a word about why. Saying so beats being confidently wrong.
  if (model.grants.length > 0) {
    const n = model.grants.length;
    notes.add(
      `${n} grant${n === 1 ? "" : "s"} not evaluated: this reads acls only, so access permitted solely by a grant is reported as deny.`,
    );
  }

  const wantedProto = normalizeProto(query.protocol ?? null);
  const wantedPort = query.port ?? null;

  const srcQuery = expand(query.src, model, hostAliases, notes, new Set());
  const dstQuery = expand(query.dst, model, hostAliases, notes, new Set());

  for (let i = 0; i < model.acls.length; i++) {
    const rule = model.acls[i];
    // Headscale only honours `accept`; anything else is inert.
    if (rule.action !== "accept") continue;

    // Source side.
    let matchedSrc: string | null = null;
    for (const entry of rule.src) {
      const exp = expand(entry, model, hostAliases, notes, new Set());
      if (covers(srcQuery, exp)) {
        matchedSrc = entry;
        break;
      }
    }
    if (matchedSrc === null) continue;

    if (!protoOk(rule, wantedProto)) continue;

    // Destination side (ports live on each dst entry).
    for (const entry of rule.dst) {
      const { host, ports } = splitDstPorts(entry);
      const exp = expand(host, model, hostAliases, notes, new Set());
      if (covers(dstQuery, exp) && portMatches(ports, wantedPort)) {
        const ruleProto = normalizeProto(rule.raw?.proto);
        if (wantedProto === null && ruleProto !== null) {
          notes.add(`This rule applies only to proto ${ruleProto}.`);
        }
        return {
          decision: "allow",
          match: {
            ruleIndex: i,
            src: rule.src,
            dst: rule.dst,
            matchedSrc,
            matchedDst: entry,
          },
          notes: [...notes],
        };
      }
    }
  }

  return { decision: "deny", match: null, notes: [...notes] };
}
