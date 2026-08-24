/**
 * Lint tests. Runs on plain Node (`node --test`); see model.test.ts for why no
 * test runner is needed.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { lintPolicy } from "./lint";
import { parsePolicy } from "./model";

/** Build a policy whose single access rule names `user` as its source. */
function policyWithUser(user: string) {
  return parsePolicy(
    JSON.stringify({
      acls: [{ action: "accept", src: [user], dst: ["*:*"] }],
    }),
  ).model;
}

const unknownUsers = (user: string, knownUsers: string[]) =>
  lintPolicy(policyWithUser(user), { knownUsers }).filter(
    (f) => f.code === "unknown-user",
  );

/**
 * Headscale's policy reference writes a bare user as `alice@`, but its API reports
 * the user as a name (`alice`) plus an optional email. A verbatim comparison
 * flagged the documented spelling as an unknown user.
 */
test("a trailing-@ user reference matches the user's name", () => {
  const findings = unknownUsers("alice@", ["alice", "alice@example.com"]);
  assert.deepEqual(findings, []);
});

test("an email user reference still matches", () => {
  const findings = unknownUsers("alice@example.com", ["alice", "alice@example.com"]);
  assert.deepEqual(findings, []);
});

test("a genuinely unknown user is still flagged", () => {
  const findings = unknownUsers("mallory@", ["alice", "alice@example.com"]);
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /doesn't match any known tailnet user/);
  assert.equal(findings[0].token, "mallory@");
});

test("matching ignores case", () => {
  assert.deepEqual(unknownUsers("Alice@", ["alice"]), []);
});

/** Without the live list there is nothing to compare against, so stay quiet. */
test("the check is skipped when no user list is supplied", () => {
  const findings = lintPolicy(policyWithUser("nobody@"), {}).filter(
    (f) => f.code === "unknown-user",
  );
  assert.deepEqual(findings, []);
});

// --- grants -----------------------------------------------------------------

const lintGrant = (grant: Record<string, unknown>, code: string) =>
  lintPolicy(
    parsePolicy(JSON.stringify({ tagOwners: { "tag:db": ["a@"] }, grants: [grant] })).model,
    {},
  ).filter((f) => f.code === code);

/**
 * Tailscale's migration reference: "Port specification moves to IP field", so
 * dst ["tag:database:*"] becomes dst ["tag:database"] with ip ["*"].
 */
test("a port spec on a grant destination is flagged", () => {
  const findings = lintGrant(
    { src: ["a@"], dst: ["tag:db:5432"], ip: ["tcp:5432"] },
    "grant-dst-ports",
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].location, "grants[0].dst");
  assert.match(findings[0].message, /ports move to the ip field/);
  assert.match(findings[0].message, /dst \["tag:db"\] with ip \["5432"\]/);
});

test("the acl-style *:* destination is flagged too", () => {
  const findings = lintGrant({ src: ["a@"], dst: ["*:*"], ip: ["*"] }, "grant-dst-ports");
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /dst \["\*"\] with ip \["\*"\]/);
});

test("a clean grant destination is not flagged", () => {
  assert.deepEqual(
    lintGrant({ src: ["a@"], dst: ["tag:db"], ip: ["tcp:5432"] }, "grant-dst-ports"),
    [],
  );
});

/** `svc:` and `tag:` contain a colon without carrying a port. */
test("a service or tag destination is not mistaken for a port spec", () => {
  assert.deepEqual(
    lintGrant({ src: ["a@"], dst: ["svc:web-server"], ip: ["tcp:443"] }, "grant-dst-ports"),
    [],
  );
});

test("a grant with neither ip nor app is flagged as inert", () => {
  const findings = lintGrant({ src: ["a@"], dst: ["tag:db"] }, "grant-no-capability");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].location, "grants[0]");
});

test("an app-only grant is not flagged as inert", () => {
  assert.deepEqual(
    lintGrant(
      { src: ["a@"], dst: ["tag:db"], app: { "example.com/cap/x": [{}] } },
      "grant-no-capability",
    ),
    [],
  );
});

// --- groups may not contain groups ------------------------------------------

const lintDoc = (doc: Record<string, unknown>, code?: string) => {
  const all = lintPolicy(parsePolicy(JSON.stringify(doc)).model, {});
  return code ? all.filter((f) => f.code === code) : all;
};

/**
 * Tailscale, verbatim: "To avoid the risk of obfuscating group membership, groups
 * cannot contain other groups." The failure is quiet, which is what makes it worth
 * linting: the nested name matches no user, so the group is simply empty.
 */
test("a group inside a group is flagged", () => {
  const findings = lintDoc(
    { groups: { "group:user": ["group:admin"], "group:admin": ["a@"] } },
    "nested-group",
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].location, "groups[0].members");
  assert.equal(findings[0].token, "group:admin");
  assert.match(findings[0].message, /groups cannot contain other groups/);
});

test("a nested group is not also reported as undeclared", () => {
  const codes = lintDoc({ groups: { "group:user": ["group:ghost"] } }).map((f) => f.code);
  assert.deepEqual(codes, ["nested-group"], `got ${codes.join(", ")}`);
});

test("plain user members are not flagged", () => {
  assert.deepEqual(lintDoc({ groups: { "group:user": ["a@", "b@"] } }, "nested-group"), []);
});

// --- autogroup placement ----------------------------------------------------

test("autogroup:internet is rejected as a source", () => {
  const findings = lintDoc(
    { acls: [{ action: "accept", src: ["autogroup:internet"], dst: ["*:*"] }] },
    "autogroup-placement",
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].location, "acls[0].src");
  assert.match(findings[0].message, /only be used in policy destinations/);
});

test("autogroup:internet is accepted as a destination", () => {
  assert.deepEqual(
    lintDoc(
      { grants: [{ src: ["a@"], dst: ["autogroup:internet"], ip: ["*"] }] },
      "autogroup-placement",
    ),
    [],
  );
});

test("autogroup:danger-all is rejected as a destination", () => {
  const findings = lintDoc(
    { grants: [{ src: ["a@"], dst: ["autogroup:danger-all"], ip: ["*"] }] },
    "autogroup-placement",
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /only be used in sources/);
});

test("autogroup:nonroot is accepted in ssh users but not elsewhere", () => {
  assert.deepEqual(
    lintDoc(
      {
        ssh: [
          { action: "check", src: ["a@"], dst: ["tag:x"], users: ["autogroup:nonroot"] },
        ],
      },
      "autogroup-placement",
    ),
    [],
  );
  const misplaced = lintDoc(
    { acls: [{ action: "accept", src: ["autogroup:nonroot"], dst: ["*:*"] }] },
    "autogroup-placement",
  );
  assert.equal(misplaced.length, 1);
  assert.match(misplaced[0].message, /users field of SSH rules/);
});

/** No documented restriction -> never flagged, wherever it appears. */
test("autogroup:member and autogroup:tagged are never flagged", () => {
  assert.deepEqual(
    lintDoc(
      {
        grants: [{ src: ["autogroup:member"], dst: ["autogroup:tagged"], ip: ["*"] }],
        nodeAttrs: [{ target: ["autogroup:member"], attr: ["drive:access"] }],
      },
      "autogroup-placement",
    ),
    [],
  );
});

test("references inside grants and nodeAttrs are checked", () => {
  const model = parsePolicy(
    JSON.stringify({
      grants: [{ src: ["group:ghost"], dst: ["tag:db"], ip: ["*"] }],
      nodeAttrs: [{ target: ["tag:phantom"], attr: ["drive:share"] }],
    }),
  ).model;
  const codes = lintPolicy(model, {}).map((f) => `${f.code}@${f.location}`);
  assert.ok(
    codes.includes("undeclared-group@grants[0].src"),
    `expected an undeclared group in grants, got ${codes.join(", ")}`,
  );
  assert.ok(
    codes.includes("undeclared-tag@nodeAttrs[0].target"),
    `expected an undeclared tag in nodeAttrs, got ${codes.join(", ")}`,
  );
});
