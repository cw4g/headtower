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

/**
 * Where a reference sits. Several autogroups are only valid in one position --
 * Headscale documents `autogroup:internet` as "Can only be used in policy
 * destinations", `autogroup:danger-all` as "Can only be used as source" -- so the
 * position has to travel with the tokens.
 */
type SitePosition = "src" | "dst" | "ssh-users" | "group-members" | "other";

/** A reference site to scan: its tokens and the location label for findings. */
interface RefSite {
  location: string;
  tokens: string[];
  position: SitePosition;
}

/**
 * Autogroups whose placement Headscale restricts, with the wording it uses. An
 * autogroup that is absent here carries no documented restriction (e.g.
 * `autogroup:member`, `autogroup:tagged`) and is therefore never flagged.
 */
const AUTOGROUP_PLACEMENT: Record<string, { allowed: SitePosition[]; where: string }> = {
  "autogroup:internet": { allowed: ["dst"], where: "policy destinations" },
  "autogroup:self": { allowed: ["dst"], where: "policy destinations" },
  "autogroup:danger-all": { allowed: ["src"], where: "sources" },
  "autogroup:nonroot": {
    allowed: ["ssh-users"],
    where: "the users field of SSH rules",
  },
};

/** Collect every reference site in the model, each with its location label. */
function collectRefSites(model: PolicyModel): RefSite[] {
  const sites: RefSite[] = [];

  model.acls.forEach((rule, i) => {
    sites.push({ location: `acls[${i}].src`, tokens: rule.src, position: "src" });
    sites.push({ location: `acls[${i}].dst`, tokens: rule.dst, position: "dst" });
  });
  model.ssh.forEach((rule, i) => {
    sites.push({ location: `ssh[${i}].src`, tokens: rule.src, position: "src" });
    sites.push({ location: `ssh[${i}].dst`, tokens: rule.dst, position: "dst" });
    sites.push({
      location: `ssh[${i}].users`,
      tokens: rule.users,
      position: "ssh-users",
    });
  });
  model.grants.forEach((grant, i) => {
    sites.push({ location: `grants[${i}].src`, tokens: grant.src, position: "src" });
    // Treated like an acl dst so a stray port spec is peeled and does not also
    // masquerade as an undeclared tag; the port is reported by its own check.
    sites.push({ location: `grants[${i}].dst`, tokens: grant.dst, position: "dst" });
    sites.push({ location: `grants[${i}].via`, tokens: grant.via, position: "other" });
  });
  model.nodeAttrs.forEach((entry, i) => {
    sites.push({
      location: `nodeAttrs[${i}].target`,
      tokens: entry.target,
      position: "other",
    });
  });
  model.tagOwners.forEach((tag, i) => {
    sites.push({
      location: `tagOwners[${i}].owners`,
      tokens: tag.values,
      position: "other",
    });
  });
  model.groups.forEach((group, i) => {
    sites.push({
      location: `groups[${i}].members`,
      tokens: group.values,
      position: "group-members",
    });
  });
  model.autoApprovers.routes.forEach((route, i) => {
    sites.push({
      location: `autoApprovers.routes[${i}]`,
      tokens: route.values,
      position: "other",
    });
  });
  sites.push({
    location: "autoApprovers.exitNode",
    tokens: model.autoApprovers.exitNode,
    position: "other",
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
      const token = referencePart(raw, site.position === "dst");
      if (token === "") continue;
      const kind = classifyToken(token, hostAliases);

      // An autogroup in the wrong position is invalid however well it is spelled.
      const placement = AUTOGROUP_PLACEMENT[token];
      if (placement && !placement.allowed.includes(site.position)) {
        findings.push({
          id: `autogroup-placement:${site.location}:${token}`,
          severity: "warn",
          code: "autogroup-placement",
          message: `"${token}" can only be used in ${placement.where}.`,
          location: site.location,
          token,
        });
        continue;
      }

      // A group inside groups[].members is reported by its own rule below; the
      // undeclared-group message would be misleading there.
      if (site.position === "group-members" && kind === "group") continue;

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

  // --- Groups may not contain groups ---------------------------------------
  model.groups.forEach((group, i) => {
    const location = `groups[${i}].members`;
    for (const token of group.values) {
      if (!token.startsWith("group:")) continue;
      // Tailscale, verbatim: "To avoid the risk of obfuscating group membership,
      // groups cannot contain other groups." Headscale inherits the rule, and the
      // failure is quiet -- the nested name resolves to no user, leaving the group
      // empty and every rule that references it inert.
      findings.push({
        id: `nested-group:${location}:${token}`,
        severity: "warn",
        code: "nested-group",
        message: `"${token}" is a group: groups cannot contain other groups. List the members directly.`,
        location,
        token,
      });
    }
  });

  // --- Grants: the shape an ACL habit gets wrong ---------------------------
  model.grants.forEach((grant, i) => {
    const location = `grants[${i}].dst`;
    for (const token of grant.dst) {
      const { host, ports } = splitDstPorts(token);
      if (ports === null) continue;
      // Tailscale's ACL-to-grant migration reference: "Port specification moves
      // to IP field", turning dst ["tag:database:*"] into dst ["tag:database"]
      // plus ip ["*"]. A port on a grant's destination is an acl habit.
      findings.push({
        id: `grant-dst-ports:${location}:${token}`,
        severity: "warn",
        code: "grant-dst-ports",
        message: `"${token}" carries a port spec. In a grant the ports move to the ip field: dst ["${host}"] with ip ["${ports}"].`,
        location,
        token,
      });
    }

    // src and dst are required, but the capability may be either ip or app
    // ("Optional if `app` provided"). With neither, the grant does nothing.
    if (grant.ip.length === 0 && !grant.app) {
      findings.push({
        id: `grant-no-capability:grants[${i}]`,
        severity: "warn",
        code: "grant-no-capability",
        message:
          "This grant carries neither ports (ip) nor an application capability (app), so it grants nothing.",
        location: `grants[${i}]`,
      });
    }
  });

  // --- Taildrive: attribute and grant must line up -------------------------
  const coverage: CoverageContext = {
    groups: new Map(
      model.groups.map((g) => [g.name, g.values.map((v) => v.toLowerCase())]),
    ),
    hostAliases,
  };
  const shareTargets = attrTargets(model, "drive:share");
  const accessTargets = attrTargets(model, "drive:access");
  const driveGrants = model.grants.filter(
    (g) => g.app !== undefined && DRIVE_CAP in g.app,
  );

  model.grants.forEach((grant, i) => {
    if (grant.app === undefined || !(DRIVE_CAP in grant.app)) return;

    if (provablyUncovered(grant.dst, shareTargets, coverage)) {
      findings.push({
        id: `drive-share-missing:grants[${i}].dst`,
        severity: "warn",
        code: "drive-share-missing",
        message: `Taildrive grant without effect: nothing under nodeAttrs gives its destination the "drive:share" attribute.`,
        location: `grants[${i}].dst`,
      });
    }

    if (provablyUncovered(grant.src, accessTargets, coverage)) {
      findings.push({
        id: `drive-access-missing:grants[${i}].src`,
        severity: "warn",
        code: "drive-access-missing",
        message: `Taildrive grant without effect: nothing under nodeAttrs gives its source the "drive:access" attribute.`,
        location: `grants[${i}].src`,
      });
    }
  });

  // The mirror image: an attribute set without any grant to act on.
  if (driveGrants.length === 0) {
    model.nodeAttrs.forEach((entry, i) => {
      for (const attr of entry.attr) {
        if (attr !== "drive:share" && attr !== "drive:access") continue;
        findings.push({
          id: `drive-attr-unused:nodeAttrs[${i}]:${attr}`,
          severity: "warn",
          code: "drive-attr-unused",
          message: `"${attr}" has no effect: no grant carries the ${DRIVE_CAP} capability.`,
          location: `nodeAttrs[${i}].attr`,
          token: attr,
        });
      }
    });
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

/* ---------------------------------------------------------------------------
 * Taildrive: the two halves have to line up
 *
 * Tailscale requires both an attribute and a grant -- `drive:share` on the node
 * that exports, `drive:access` on the node that consumes, plus a grant carrying
 * `tailscale.com/cap/drive`. Set one without the other and nothing happens, with
 * no error anywhere. That silence is what makes it worth linting.
 *
 * The difficulty is that the two halves rarely name the same token: a grant may
 * say `group:user` while the attribute says `autogroup:member`. So this reasons
 * about COVERAGE, and answers "unknown" wherever it cannot decide -- a finding is
 * only emitted when every token is provably uncovered.
 * ------------------------------------------------------------------------- */

const DRIVE_CAP = "tailscale.com/cap/drive";

/** Whether a selector is covered by a set of targets, or undecidable. */
type Coverage = "covered" | "uncovered" | "unknown";

interface CoverageContext {
  /** Declared group -> its members, lowercased. */
  groups: Map<string, string[]>;
  hostAliases: Set<string>;
}

/** Is `token` a group made up purely of users (so `autogroup:member` covers it)? */
function isUserGroup(token: string, ctx: CoverageContext): Coverage {
  const members = ctx.groups.get(token);
  if (members === undefined) return "unknown"; // undeclared: cannot tell
  if (members.length === 0) return "unknown";
  const allUsers = members.every(
    (m) => classifyToken(m, ctx.hostAliases) === "user",
  );
  return allUsers ? "covered" : "unknown";
}

/** Does a single `target` cover `token`? */
function targetCovers(token: string, target: string, ctx: CoverageContext): Coverage {
  if (target === token) return "covered";
  if (target === "*") return "covered";

  const tokenKind = classifyToken(token, ctx.hostAliases);

  if (target === "autogroup:member") {
    // Documented: autogroup:member is "any user who is a direct member" and a
    // tagged device is explicitly a different autogroup, so a tag is NOT covered.
    if (tokenKind === "user") return "covered";
    if (tokenKind === "group") return isUserGroup(token, ctx);
    if (tokenKind === "tag") return "uncovered";
    return "unknown";
  }

  if (target === "autogroup:tagged") {
    if (tokenKind === "tag") return "covered";
    if (tokenKind === "user" || tokenKind === "group") return "uncovered";
    return "unknown";
  }

  if (target.startsWith("group:")) {
    const members = ctx.groups.get(target);
    if (members === undefined) return "unknown";
    if (tokenKind === "user") {
      const needle = token.toLowerCase();
      const bare = needle.endsWith("@") ? needle.slice(0, -1) : needle;
      const hit = members.some((m) => {
        const mm = m.toLowerCase();
        return mm === needle || (mm.endsWith("@") ? mm.slice(0, -1) : mm) === bare;
      });
      return hit ? "covered" : "uncovered";
    }
    // Groups cannot nest, so another group is never inside this one.
    if (tokenKind === "group") return "uncovered";
    return "unknown";
  }

  if (target.startsWith("tag:")) {
    return tokenKind === "tag" ? "uncovered" : "unknown";
  }

  return "unknown";
}

/** Coverage of `token` by any of `targets`: covered wins, then unknown. */
function coveredByAny(
  token: string,
  targets: string[],
  ctx: CoverageContext,
): Coverage {
  let sawUnknown = false;
  for (const target of targets) {
    const verdict = targetCovers(token, target, ctx);
    if (verdict === "covered") return "covered";
    if (verdict === "unknown") sawUnknown = true;
  }
  return sawUnknown ? "unknown" : "uncovered";
}

/** Every target of every nodeAttrs entry carrying `attr`. */
function attrTargets(model: PolicyModel, attr: string): string[] {
  const out: string[] = [];
  for (const entry of model.nodeAttrs) {
    if (entry.attr.includes(attr)) out.push(...entry.target);
  }
  return out;
}

/**
 * True only when NO token of the list is covered and none is undecidable -- i.e.
 * the whole side is provably without the attribute. Anything less stays quiet.
 */
function provablyUncovered(
  tokens: string[],
  targets: string[],
  ctx: CoverageContext,
): boolean {
  if (tokens.length === 0) return false;
  return tokens.every(
    (token) => coveredByAny(token, targets, ctx) === "uncovered",
  );
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
