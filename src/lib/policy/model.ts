/**
 * Structured model for the standard Headscale HuJSON policy, plus a lossless
 * parse <-> serialize round-trip.
 *
 * The contract: `serializePolicy(parsePolicy(src).model, parsePolicy(src).root)`
 * preserves every untouched top-level key, every untouched field inside a rule,
 * and the original key order. Unknown keys (top-level or inside autoApprovers /
 * individual rules) pass straight through. The visual editor only ever mutates
 * the known sections below; everything else is carried verbatim on `root` and on
 * each rule's `raw` snapshot.
 *
 * Isomorphic and dependency-free - safe to import from client components.
 */

import { cleanParseMessage, parseHujson } from "./hujson";

/**
 * A Headscale ACL access rule. Headscale only accepts `action: "accept"`, but we
 * keep `action` as a string and preserve `raw` so an unusual document survives a
 * round-trip untouched.
 */
export interface AclRule {
  action: string;
  src: string[];
  dst: string[];
  /** The originally-parsed object, for lossless passthrough of extra fields. */
  raw?: Record<string, unknown>;
}

/** A Headscale SSH rule. `action` is `accept` or `check` (kept loose for safety). */
export interface SshRule {
  action: string;
  src: string[];
  dst: string[];
  users: string[];
  raw?: Record<string, unknown>;
}

/** A named string list: groups -> members, tagOwners -> owners, routes -> approvers. */
export interface NamedList {
  name: string;
  values: string[];
}

/** A host alias: a name mapped to a single CIDR. */
export interface HostEntry {
  name: string;
  cidr: string;
}

/** autoApprovers, split into its two standard shapes. */
export interface AutoApprovers {
  /** Route CIDR -> approvers (tags / groups / users). */
  routes: NamedList[];
  /** Approvers permitted to advertise an exit node. */
  exitNode: string[];
}

/**
 * A `nodeAttrs` entry (Headscale >= 0.29): capabilities handed to every node
 * matching `target`.
 *
 * `attr` carries the key-only attributes (`drive:share`, `magicdns-aaaa`, ...).
 * The set is open -- Headscale's policy reference says "At least the following
 * node attributes are currently supported" -- so nothing here validates a value
 * against a list. `app` carries application capabilities and stays opaque.
 */
export interface NodeAttrEntry {
  target: string[];
  attr: string[];
  /** Application capabilities, passed through untouched. */
  app?: Record<string, unknown>;
  raw?: Record<string, unknown>;
}

/**
 * A `grant` (Headscale >= 0.29): the successor to an ACL rule, able to carry
 * application capabilities as well as ports.
 *
 * `src` and `dst` are required, but the capability may be either `ip` or `app`
 * ("Optional if `app` provided" -- Tailscale's grants reference), so an absent
 * `ip` must stay absent on the way out. `app` parameters are opaque: Tailscale
 * "treats application capability parameters as opaque JSON objects", so they are
 * carried verbatim rather than interpreted.
 */
export interface GrantEntry {
  src: string[];
  dst: string[];
  ip: string[];
  /** Routing through a tagged subnet router / exit node. */
  via: string[];
  app?: Record<string, unknown>;
  raw?: Record<string, unknown>;
}

/** The editable, known surface of a policy document. */
export interface PolicyModel {
  groups: NamedList[];
  tagOwners: NamedList[];
  hosts: HostEntry[];
  acls: AclRule[];
  ssh: SshRule[];
  nodeAttrs: NodeAttrEntry[];
  grants: GrantEntry[];
  autoApprovers: AutoApprovers;
}

/** Result of {@link parsePolicy}. */
export interface ParsedPolicy {
  /** True when the source parsed to a JSON object. */
  ok: boolean;
  /** The extracted, editable model (empty when `ok` is false). */
  model: PolicyModel;
  /** The full parsed root object, retained for lossless serialization. */
  root: Record<string, unknown>;
  /** A short reason when `ok` is false. */
  error?: string;
}

/** A fresh, empty policy model - the starting point for an unset policy. */
export function emptyModel(): PolicyModel {
  return {
    groups: [],
    tagOwners: [],
    hosts: [],
    acls: [],
    ssh: [],
    nodeAttrs: [],
    grants: [],
    autoApprovers: { routes: [], exitNode: [] },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Coerce a value into a string array, tolerating a bare string or junk. */
function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((x): x is string => typeof x === "string");
  }
  if (typeof value === "string") return [value];
  return [];
}

function parseNamedLists(value: unknown): NamedList[] {
  if (!isObject(value)) return [];
  return Object.entries(value).map(([name, val]) => ({
    name,
    values: toStringArray(val),
  }));
}

function parseHosts(value: unknown): HostEntry[] {
  if (!isObject(value)) return [];
  return Object.entries(value).map(([name, val]) => ({
    name,
    cidr: typeof val === "string" ? val : "",
  }));
}

function parseAcls(value: unknown): AclRule[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isObject).map((rule) => ({
    action: typeof rule.action === "string" ? rule.action : "accept",
    src: toStringArray(rule.src),
    dst: toStringArray(rule.dst),
    raw: rule,
  }));
}

function parseSsh(value: unknown): SshRule[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isObject).map((rule) => ({
    action: typeof rule.action === "string" ? rule.action : "accept",
    src: toStringArray(rule.src),
    dst: toStringArray(rule.dst),
    users: toStringArray(rule.users),
    raw: rule,
  }));
}

function parseNodeAttrs(value: unknown): NodeAttrEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isObject).map((entry) => ({
    target: toStringArray(entry.target),
    attr: toStringArray(entry.attr),
    ...(isObject(entry.app) ? { app: entry.app } : {}),
    raw: entry,
  }));
}

function parseGrants(value: unknown): GrantEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isObject).map((entry) => ({
    src: toStringArray(entry.src),
    dst: toStringArray(entry.dst),
    ip: toStringArray(entry.ip),
    via: toStringArray(entry.via),
    ...(isObject(entry.app) ? { app: entry.app } : {}),
    raw: entry,
  }));
}

function parseAutoApprovers(value: unknown): AutoApprovers {
  if (!isObject(value)) return { routes: [], exitNode: [] };
  return {
    routes: parseNamedLists(value.routes),
    exitNode: toStringArray(value.exitNode),
  };
}

/**
 * Parse a HuJSON policy into its editable model plus the full root object. An
 * empty source yields an empty (but valid) model. A parse failure or a non-object
 * document yields `ok: false`, so the caller can fall back to the raw editor
 * rather than silently discarding the document.
 */
export function parsePolicy(source: string): ParsedPolicy {
  if (source.trim() === "") {
    return { ok: true, model: emptyModel(), root: {} };
  }

  let parsed: unknown;
  try {
    parsed = parseHujson(source);
  } catch (err) {
    return { ok: false, model: emptyModel(), root: {}, error: cleanParseMessage(err) };
  }

  if (!isObject(parsed)) {
    return {
      ok: false,
      model: emptyModel(),
      root: {},
      error: "The policy must be a JSON object.",
    };
  }

  const model: PolicyModel = {
    groups: parseNamedLists(parsed.groups),
    tagOwners: parseNamedLists(parsed.tagOwners),
    hosts: parseHosts(parsed.hosts),
    acls: parseAcls(parsed.acls),
    ssh: parseSsh(parsed.ssh),
    nodeAttrs: parseNodeAttrs(parsed.nodeAttrs),
    grants: parseGrants(parsed.grants),
    autoApprovers: parseAutoApprovers(parsed.autoApprovers),
  };

  return { ok: true, model, root: parsed };
}

/** Build a record of name -> string[], skipping nameless rows. */
function buildNamedRecord(items: NamedList[]): Record<string, string[]> {
  const record: Record<string, string[]> = {};
  for (const item of items) {
    if (item.name.trim() === "") continue;
    record[item.name] = [...item.values];
  }
  return record;
}

/** Build a record of name -> CIDR, skipping nameless rows. */
function buildHostRecord(items: HostEntry[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const item of items) {
    if (item.name.trim() === "") continue;
    record[item.name] = item.cidr;
  }
  return record;
}

/** Rebuild a rule object from `raw`, overwriting only the known fields in place. */
function serializeAcl(rule: AclRule): Record<string, unknown> {
  const out: Record<string, unknown> = rule.raw ? { ...rule.raw } : {};
  out.action = rule.action || "accept";
  out.src = [...rule.src];
  out.dst = [...rule.dst];
  return out;
}

function serializeSsh(rule: SshRule): Record<string, unknown> {
  const out: Record<string, unknown> = rule.raw ? { ...rule.raw } : {};
  out.action = rule.action || "accept";
  out.src = [...rule.src];
  out.dst = [...rule.dst];
  out.users = [...rule.users];
  return out;
}

/**
 * Write back an edited `app` map. Opaque does not mean read-only: the editor may
 * change these, so a modelled `app` always wins. The key is dropped only when we
 * actually modelled it -- an `app` that parse skipped because it was not an object
 * stays on `raw` untouched instead of being deleted.
 */
function emitApp(
  out: Record<string, unknown>,
  raw: Record<string, unknown>,
  app: Record<string, unknown> | undefined,
): void {
  if (app && Object.keys(app).length > 0) out.app = app;
  else if (isObject(raw.app)) delete out.app;
}

/**
 * `target` is mandatory, so it is always written; `attr` goes through {@link emit}
 * because an entry may carry only `app`.
 */
function serializeNodeAttr(entry: NodeAttrEntry): Record<string, unknown> {
  const raw = entry.raw ?? {};
  const out: Record<string, unknown> = { ...raw };
  out.target = [...entry.target];
  emit(out, raw, "attr", [...entry.attr]);
  emitApp(out, raw, entry.app);
  return out;
}

/**
 * `ip` and `via` go through {@link emit}: a grant whose capability is `app` has no
 * `ip` key, and writing an empty one back would change a document the operator
 * reviews as a diff. `src` / `dst` are required and always written.
 */
function serializeGrant(entry: GrantEntry): Record<string, unknown> {
  const raw = entry.raw ?? {};
  const out: Record<string, unknown> = { ...raw };
  out.src = [...entry.src];
  out.dst = [...entry.dst];
  emit(out, raw, "ip", [...entry.ip]);
  emit(out, raw, "via", [...entry.via]);
  emitApp(out, raw, entry.app);
  return out;
}

/**
 * Assign `built` onto `out[key]` when it has content, or when the key already
 * existed in `source` (so a section the user emptied stays present rather than
 * vanishing). Otherwise drop it. Reassigning an existing key preserves its
 * position; a genuinely new section is appended.
 */
function emit(
  out: Record<string, unknown>,
  source: Record<string, unknown>,
  key: string,
  built: unknown[] | Record<string, unknown>,
): void {
  const nonEmpty = Array.isArray(built)
    ? built.length > 0
    : Object.keys(built).length > 0;
  if (nonEmpty || key in source) {
    out[key] = built;
  } else {
    delete out[key];
  }
}

/**
 * Serialize a model back to a HuJSON (here, formatted JSON) document, preserving
 * the original root: unknown top-level keys, untouched key order, and untouched
 * fields inside each rule all survive. Pass the `root` returned by
 * {@link parsePolicy} to keep the round-trip lossless.
 */
export function serializePolicy(
  model: PolicyModel,
  root: Record<string, unknown> = {},
): string {
  const out: Record<string, unknown> = { ...root };

  emit(out, root, "groups", buildNamedRecord(model.groups));
  emit(out, root, "tagOwners", buildNamedRecord(model.tagOwners));
  emit(out, root, "hosts", buildHostRecord(model.hosts));
  emit(out, root, "acls", model.acls.map(serializeAcl));
  emit(out, root, "ssh", model.ssh.map(serializeSsh));
  emit(out, root, "nodeAttrs", model.nodeAttrs.map(serializeNodeAttr));
  emit(out, root, "grants", model.grants.map(serializeGrant));

  // autoApprovers is nested: clone its raw form to keep any unknown sub-keys,
  // then overlay the two known shapes.
  const rawAutoApprovers = isObject(root.autoApprovers) ? root.autoApprovers : {};
  const autoApprovers: Record<string, unknown> = { ...rawAutoApprovers };
  emit(autoApprovers, rawAutoApprovers, "routes", buildNamedRecord(model.autoApprovers.routes));
  emit(autoApprovers, rawAutoApprovers, "exitNode", [...model.autoApprovers.exitNode]);

  if (Object.keys(autoApprovers).length > 0 || "autoApprovers" in root) {
    out.autoApprovers = autoApprovers;
  } else {
    delete out.autoApprovers;
  }

  return JSON.stringify(out, null, 2);
}

/** Convenience: parse then serialize. Used to normalize / verify round-trips. */
export function roundTripPolicy(source: string): string {
  const { model, root } = parsePolicy(source);
  return serializePolicy(model, root);
}
