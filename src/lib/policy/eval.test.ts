/**
 * Reachability evaluator tests, focused on what it says about its own limits.
 * Runs on plain Node (`node --test`); see model.test.ts for why.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { evaluateReachability } from "./eval";
import { parsePolicy } from "./model";

const modelOf = (doc: Record<string, unknown>) =>
  parsePolicy(JSON.stringify(doc)).model;

const grantNote = (notes: string[]) => notes.find((n) => n.includes("not evaluated"));

/**
 * The case that made this necessary: a policy migrated fully to grants has an
 * empty `acls`, so the evaluator answers "deny" for everything. Silently that is
 * misleading rather than merely incomplete.
 */
test("a grants-only policy denies but says grants were not evaluated", () => {
  const model = modelOf({
    acls: [],
    grants: [{ src: ["group:eng"], dst: ["tag:db"], ip: ["*"] }],
    groups: { "group:eng": ["a@"] },
    tagOwners: { "tag:db": ["a@"] },
  });

  const result = evaluateReachability(model, { src: "group:eng", dst: "tag:db" });
  assert.equal(result.decision, "deny");
  const note = grantNote(result.notes);
  assert.ok(note, `expected a note about grants, got: ${result.notes.join(" | ")}`);
  assert.match(note, /^1 grant not evaluated/);
});

test("the count is pluralised", () => {
  const model = modelOf({
    grants: [
      { src: ["a@"], dst: ["tag:x"], ip: ["*"] },
      { src: ["b@"], dst: ["tag:x"], ip: ["*"] },
    ],
  });
  const note = grantNote(evaluateReachability(model, { src: "a@", dst: "tag:x" }).notes);
  assert.match(note ?? "", /^2 grants not evaluated/);
});

test("a policy without grants carries no such note", () => {
  const model = modelOf({
    acls: [{ action: "accept", src: ["group:eng"], dst: ["tag:db:*"] }],
    groups: { "group:eng": ["a@"] },
    tagOwners: { "tag:db": ["a@"] },
  });

  const result = evaluateReachability(model, { src: "group:eng", dst: "tag:db" });
  assert.equal(result.decision, "allow");
  assert.equal(grantNote(result.notes), undefined);
});

/** An allow stays an allow -- policies are allow-only, so a grant cannot revoke it. */
test("the note also rides along on an allow", () => {
  const model = modelOf({
    acls: [{ action: "accept", src: ["group:eng"], dst: ["tag:db:*"] }],
    grants: [{ src: ["group:eng"], dst: ["tag:db"], ip: ["*"] }],
    groups: { "group:eng": ["a@"] },
    tagOwners: { "tag:db": ["a@"] },
  });

  const result = evaluateReachability(model, { src: "group:eng", dst: "tag:db" });
  assert.equal(result.decision, "allow");
  assert.ok(grantNote(result.notes), "the caveat belongs on an allow too");
});

test("an empty question is answered without the grant note", () => {
  const model = modelOf({ grants: [{ src: ["a@"], dst: ["tag:x"], ip: ["*"] }] });
  const result = evaluateReachability(model, { src: "", dst: "tag:x" });
  assert.equal(result.decision, "deny");
  assert.equal(grantNote(result.notes), undefined);
});
