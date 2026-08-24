/**
 * Reachability evaluator tests, with the emphasis on grants: Tailscale calls acls
 * "legacy" and advises favouring grants, so a policy with an empty `acls` has to
 * evaluate correctly rather than default-deny everything.
 *
 * Runs on plain Node (`node --test`); see model.test.ts for why.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { evaluateReachability } from "./eval";
import { parsePolicy } from "./model";

const modelOf = (doc: Record<string, unknown>) =>
  parsePolicy(JSON.stringify(doc)).model;

/** A grants-only policy: one group reaching one tagged host on 5432. */
const GRANTS_ONLY = modelOf({
  acls: [],
  grants: [{ src: ["group:eng"], dst: ["tag:db"], ip: ["tcp:5432"] }],
  groups: { "group:eng": ["alice@"] },
  tagOwners: { "tag:db": ["alice@"] },
});

// --- grants are evaluated ----------------------------------------------------

test("a grant allows the traffic it names", () => {
  const r = evaluateReachability(GRANTS_ONLY, {
    src: "group:eng",
    dst: "tag:db",
    port: 5432,
    protocol: "tcp",
  });
  assert.equal(r.decision, "allow");
  assert.equal(r.match?.section, "grants");
  assert.equal(r.match?.ruleIndex, 0);
  assert.equal(r.match?.matchedIp, "tcp:5432");
});

test("a member of the granted group is allowed too", () => {
  const r = evaluateReachability(GRANTS_ONLY, {
    src: "alice@",
    dst: "tag:db",
    port: 5432,
  });
  assert.equal(r.decision, "allow", r.notes.join(" | "));
});

test("a port outside the grant is denied", () => {
  const r = evaluateReachability(GRANTS_ONLY, {
    src: "group:eng",
    dst: "tag:db",
    port: 22,
  });
  assert.equal(r.decision, "deny");
});

test("the wrong protocol is denied", () => {
  const r = evaluateReachability(GRANTS_ONLY, {
    src: "group:eng",
    dst: "tag:db",
    port: 5432,
    protocol: "udp",
  });
  assert.equal(r.decision, "deny");
});

test("asking for any protocol accepts a narrower grant, and says so", () => {
  const r = evaluateReachability(GRANTS_ONLY, {
    src: "group:eng",
    dst: "tag:db",
    port: 5432,
  });
  assert.equal(r.decision, "allow");
  assert.ok(
    r.notes.some((n) => /applies only to proto/.test(n)),
    `expected a protocol note, got: ${r.notes.join(" | ")}`,
  );
});

test("an unrelated source is denied", () => {
  const r = evaluateReachability(GRANTS_ONLY, { src: "mallory@", dst: "tag:db" });
  assert.equal(r.decision, "deny");
});

// --- the ip field's own vocabulary ------------------------------------------

const withIp = (ip: string[]) =>
  modelOf({ grants: [{ src: ["*"], dst: ["*"], ip }] });

test("a bare port number is a port spec, as the migration guide produces", () => {
  const r = evaluateReachability(withIp(["80"]), { src: "a@", dst: "b@", port: 80 });
  assert.equal(r.decision, "allow");
  assert.equal(
    evaluateReachability(withIp(["80"]), { src: "a@", dst: "b@", port: 81 }).decision,
    "deny",
  );
});

test("the wildcard admits every port", () => {
  const r = evaluateReachability(withIp(["*"]), { src: "a@", dst: "b@", port: 9999 });
  assert.equal(r.decision, "allow");
});

test("a bare protocol name means that protocol on any port", () => {
  const model = withIp(["icmp"]);
  assert.equal(
    evaluateReachability(model, { src: "a@", dst: "b@", protocol: "icmp" }).decision,
    "allow",
  );
  assert.equal(
    evaluateReachability(model, { src: "a@", dst: "b@", protocol: "tcp" }).decision,
    "deny",
  );
});

/** "6" is the numeric alias for tcp, but as an `ip` entry it means port 6. */
test("a numeric entry is read as a port, not as a protocol number", () => {
  const model = withIp(["6"]);
  assert.equal(
    evaluateReachability(model, { src: "a@", dst: "b@", port: 6 }).decision,
    "allow",
  );
  assert.equal(
    evaluateReachability(model, { src: "a@", dst: "b@", port: 443 }).decision,
    "deny",
  );
});

// --- app-only grants are not network reach ----------------------------------

/**
 * The case that has to stay a deny: an application capability grants Taildrive
 * access, not IP reachability. Denying silently would look like a bug, so the
 * match is reported as a note.
 */
test("an app-only grant does not allow, but explains itself", () => {
  const model = modelOf({
    hosts: { fileserver: "100.64.0.10/32" },
    grants: [
      {
        src: ["group:user"],
        dst: ["fileserver"],
        app: { "tailscale.com/cap/drive": [{ shares: ["*"], access: "ro" }] },
      },
    ],
    groups: { "group:user": ["alice@"] },
  });

  const r = evaluateReachability(model, { src: "group:user", dst: "fileserver" });
  assert.equal(r.decision, "deny");
  assert.ok(
    r.notes.some((n) => n.includes("tailscale.com/cap/drive") && n.includes("matches")),
    `expected an app-capability note, got: ${r.notes.join(" | ")}`,
  );
});

test("a grant with no capability at all is reported as such", () => {
  const model = modelOf({ grants: [{ src: ["*"], dst: ["*"] }] });
  const r = evaluateReachability(model, { src: "a@", dst: "b@" });
  assert.equal(r.decision, "deny");
  assert.ok(r.notes.some((n) => /neither ports nor an application capability/.test(n)));
});

// --- via, and coexistence with acls -----------------------------------------

test("a routed grant mentions its via", () => {
  const model = modelOf({
    grants: [{ src: ["*"], dst: ["*"], ip: ["*"], via: ["tag:router"] }],
    tagOwners: { "tag:router": ["a@"] },
  });
  const r = evaluateReachability(model, { src: "a@", dst: "b@" });
  assert.equal(r.decision, "allow");
  assert.ok(r.notes.some((n) => /routes via tag:router/.test(n)));
});

/** Both sections are live; acls are tried first, so they keep reporting as acls. */
test("acls still match and are labelled as acls", () => {
  const model = modelOf({
    acls: [{ action: "accept", src: ["group:eng"], dst: ["tag:db:*"] }],
    grants: [{ src: ["group:eng"], dst: ["tag:db"], ip: ["*"] }],
    groups: { "group:eng": ["alice@"] },
    tagOwners: { "tag:db": ["alice@"] },
  });
  const r = evaluateReachability(model, { src: "group:eng", dst: "tag:db" });
  assert.equal(r.decision, "allow");
  assert.equal(r.match?.section, "acls");
  assert.equal(r.match?.matchedIp, undefined);
});

test("an empty question still asks for both ends", () => {
  const r = evaluateReachability(GRANTS_ONLY, { src: "", dst: "tag:db" });
  assert.equal(r.decision, "deny");
  assert.match(r.notes[0], /Pick both a source and a destination/);
});
