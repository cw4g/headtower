/**
 * Advisory, semantic lint for a parsed policy model.
 *
 * Pure and isomorphic - safe to run on every keystroke in the client. These
 * findings are *never* blocking; Headscale remains the authoritative validator
 * on save. The linter surfaces the mistakes a syntax check can't: references to
 * groups or tags that were never declared, user references that don't match any
 * real tailnet user, and duplicate definitions that silently shadow each other.
 *
 * Each finding carries a `location` (e.g. `acls[2].src`) so the UI can point the
 * operator straight at the offending spot.
 */

import type { PolicyModel } from "./model";
import { classifyToken, splitDstPorts } from "./tokens";

/** Severity of an advisory finding. Never blocks a save. */
export type LintSeverity = "warn" | "info";

/** A single advisory finding over the policy model. */
export interface LintFinding {
  /** Stable-ish key for React lists: `${code}:${location}:${token}`. */
  id: string;
  severity: LintSeverity;
  /** Machine code, e.g. `undeclared-group`, `unknown-user`, `duplicate-group`. */
  code: string;
  /** Human-readable, one line. */
  message: string;
  /** Where it lives, e.g. `acls[2].src`, `groups[1].name`. */
  location: string;
  /** The specific offending token, when there is one. */
  token?: string;
}

export interface LintOptions {
  /**
   * Known tailnet users - names and/or emails from the live user list. When
   * provided, email-like user references not in this set are flagged. When
   * omitted, the unknown-user check is skipped (we can't tell without the list).
   */
  knownUsers?: string[];
}

/**
 * Match a policy user reference against the tailnet's user list.
 *
 * A bare user is written with a trailing `@` in a policy -- Headscale's policy
 * reference spells it exactly that way (`"alice@"`) -- while the API reports users
 * as a name plus an optional email. Comparing verbatim therefore flags the
 * documented spelling as unknown, so `alice@` must also match the user `alice`.
 */
function matchesKnownUser(token: string, knownUsers: Set<string>): boolean {
  const needle = token.toLowerCase();
  if (knownUsers.has(needle)) return true;
  return needle.endsWith("@") && knownUsers.has(needle.slice(0, -1));
}

/** A reference site to scan: its tokens and the location label for findings. */
interface RefSite {
  location: string;
  tokens: string[];
  /** dst sites carry a trailing port spec that must be peeled before checks. */
  isDst?: boolean;
}

/** Collect every reference site in the model, each with its location label. */
function collectRefSites(model: PolicyModel): RefSite[] {
  const sites: RefSite[] = [];

  model.acls.forEach((rule, i) => {
    sites.push({ location: `acls[${i}].src`, tokens: rule.src });
    sites.push({ location: `acls[${i}].dst`, tokens: rule.dst, isDst: true });
  });
  model.ssh.forEach((rule, i) => {
    sites.push({ location: `ssh[${i}].src`, tokens: rule.src });
    sites.push({ location: `ssh[${i}].dst`, tokens: rule.dst, isDst: true });
    sites.push({ location: `ssh[${i}].users`, tokens: rule.users });
  });
  model.tagOwners.forEach((tag, i) => {
    sites.push({ location: `tagOwners[${i}].owners`, tokens: tag.values });
  });
  model.groups.forEach((group, i) => {
    sites.push({ location: `groups[${i}].members`, tokens: group.values });
  });
  model.autoApprovers.routes.forEach((route, i) => {
    sites.push({
      location: `autoApprovers.routes[${i}]`,
      tokens: route.values,
    });
  });
  sites.push({
    location: "autoApprovers.exitNode",
    tokens: model.autoApprovers.exitNode,
  });

  return sites;
}

/** Peel any trailing port spec off a dst token; leave other tokens untouched. */
function referencePart(token: string, isDst: boolean): string {
  return isDst ? splitDstPorts(token).host : token;
}

/**
 * Lint a policy model. Returns advisory findings, most actionable first
 * (undeclared references, then unknown users, then duplicates). Pure: same input
 * always yields the same output.
 */
export function lintPolicy(
  model: PolicyModel,
  options: LintOptions = {},
): LintFinding[] {
  const findings: LintFinding[] = [];

  const declaredGroups = new Set(
    model.groups.map((g) => g.name).filter((n) => n.startsWith("group:")),
  );
  const declaredTags = new Set(
    model.tagOwners.map((t) => t.name).filter((n) => n.startsWith("tag:")),
  );
  const hostAliases = new Set(model.hosts.map((h) => h.name).filter(Boolean));

  const knownUsers =
    options.knownUsers === undefined
      ? null
      : new Set(options.knownUsers.map((u) => u.toLowerCase()));

  // --- Undeclared group:/tag: references, and unknown users ---------------
  for (const site of collectRefSites(model)) {
    for (const raw of site.tokens) {
      const token = referencePart(raw, site.isDst ?? false);
      if (token === "") continue;
      const kind = classifyToken(token, hostAliases);

      if (kind === "group" && !declaredGroups.has(token)) {
        findings.push({
          id: `undeclared-group:${site.location}:${token}`,
          severity: "warn",
          code: "undeclared-group",
          message: `Group "${token}" is used here but never declared under groups.`,
          location: site.location,
          token,
        });
      } else if (kind === "tag" && !declaredTags.has(token)) {
        findings.push({
          id: `undeclared-tag:${site.location}:${token}`,
          severity: "warn",
          code: "undeclared-tag",
          message: `Tag "${token}" is used here but has no owner declared under tagOwners.`,
          location: site.location,
          token,
        });
      } else if (kind === "user" && knownUsers && !matchesKnownUser(token, knownUsers)) {
        findings.push({
          id: `unknown-user:${site.location}:${token}`,
          severity: "warn",
          code: "unknown-user",
          message: `"${token}" doesn't match any known tailnet user.`,
          location: site.location,
          token,
        });
      }
    }
  }

  // --- Duplicate definitions ---------------------------------------------
  findings.push(...duplicateFindings(model.groups.map((g) => g.name), "groups", "group"));
  findings.push(
    ...duplicateFindings(model.tagOwners.map((t) => t.name), "tagOwners", "tag"),
  );
  findings.push(
    ...duplicateFindings(model.hosts.map((h) => h.name), "hosts", "host"),
  );
  findings.push(
    ...duplicateFindings(
      model.autoApprovers.routes.map((r) => r.name),
      "autoApprovers.routes",
      "route",
    ),
  );

  return findings;
}

/** Emit a `duplicate-*` finding for each repeat name in a definition list. */
function duplicateFindings(
  names: string[],
  section: string,
  label: string,
): LintFinding[] {
  const seen = new Map<string, number>();
  const out: LintFinding[] = [];
  names.forEach((name, i) => {
    const key = name.trim();
    if (key === "") return;
    if (seen.has(key)) {
      out.push({
        id: `duplicate-${label}:${section}[${i}]:${key}`,
        severity: "warn",
        code: `duplicate-${label}`,
        message: `Duplicate ${label} "${key}" - the later definition shadows the first (declared at ${section}[${seen.get(key)}]).`,
        location: `${section}[${i}].name`,
        token: key,
      });
    } else {
      seen.set(key, i);
    }
  });
  return out;
}
