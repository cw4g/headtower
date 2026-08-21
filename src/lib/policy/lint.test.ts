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
