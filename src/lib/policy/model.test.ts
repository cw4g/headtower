/**
 * Round-trip contract tests for the policy model.
 *
 * model.ts promises that `serializePolicy(parsePolicy(src).model, root)` preserves
 * every untouched top-level key and every untouched field inside a rule. That claim
 * is what makes the visual editor safe to use on a policy it does not fully model,
 * so it deserves a test rather than a comment.
 *
 * Two kinds of tests live here, and the split matters:
 *
 *   1. CONTRACT - runs over every `fixtures/*.hujson` and asserts nothing about
 *      their contents. Drop your own policy in that directory and it is covered
 *      too; that is the point of keeping the specimens in files.
 *   2. SPECIFIC - names concrete values, so it reads one known fixture. Replacing
 *      that fixture will (correctly) break these.
 *
 * Small one-off documents stay inline: they are unit cases for a single branch of
 * the serializer, not policies anyone would swap.
 *
 * Runs on plain Node (`node --test`): the module under test imports nothing but
 * ./hujson, which is itself dependency-free, so no test runner is needed.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { parsePolicy, roundTripPolicy, serializePolicy } from "./model";

const FIXTURES = join(import.meta.dirname, "fixtures");

const read = (name: string): string => readFileSync(join(FIXTURES, name), "utf8");

const specimens = readdirSync(FIXTURES)
  .filter((name) => name.endsWith(".hujson"))
  .sort();

/** Top-level keys the model owns; everything else must pass through verbatim. */
const MODELLED_KEYS = [
  "groups",
  "tagOwners",
  "hosts",
  "acls",
  "ssh",
  "nodeAttrs",
  "grants",
  "autoApprovers",
];

// --- contract: must hold for any policy in fixtures/ ------------------------

test("there is at least one specimen to test against", () => {
  assert.ok(specimens.length > 0, `no *.hujson files in ${FIXTURES}`);
});

for (const name of specimens) {
  const source = read(name);

  test(`${name}: parses as a policy`, () => {
    const parsed = parsePolicy(source);
    assert.equal(parsed.ok, true, parsed.error);
  });

  test(`${name}: an unedited round-trip changes no value`, () => {
    const before = parsePolicy(source).root;
    const after = JSON.parse(roundTripPolicy(source));

    // Every key, modelled or not. A policy using a bare string where a list is
    // expected ("src": "alice@") would legitimately fail here: the model
    // normalizes it to a list. No specimen relies on that shorthand.
    for (const key of Object.keys(before)) {
      assert.deepStrictEqual(after[key], before[key], `key "${key}" changed`);
    }
  });

  test(`${name}: keys the model does not own are identical objects`, () => {
    const before = parsePolicy(source).root;
    const after = JSON.parse(roundTripPolicy(source));
    const unmodelled = Object.keys(before).filter((k) => !MODELLED_KEYS.includes(k));

    for (const key of unmodelled) {
      assert.deepStrictEqual(after[key], before[key], `unmodelled key "${key}" changed`);
    }
  });

  test(`${name}: top-level key order is preserved`, () => {
    const before = Object.keys(parsePolicy(source).root);
    const after = Object.keys(JSON.parse(roundTripPolicy(source)));
    assert.deepStrictEqual(after, before);
  });

  test(`${name}: round-trip is idempotent`, () => {
    const once = roundTripPolicy(source);
    assert.equal(roundTripPolicy(once), once);
  });

  /**
   * Documents a REAL limitation rather than asserting it away: serializePolicy
   * ends in JSON.stringify, so saving through the visual editor strips every
   * comment. A policy kept in git (Headscale's `policy.mode: file`) loses its
   * documentation the first time it is written back through the UI.
   */
  test(`${name}: comments are dropped on serialization (known limitation)`, () => {
    if (!source.includes("//")) return;
    assert.equal(roundTripPolicy(source).includes("//"), false);
  });
}

// --- specific: names concrete values, so it pins one fixture ----------------

const TAILDRIVE = read("taildrive.hujson");

test("taildrive: hosts and acls reach the model", () => {
  const { model } = parsePolicy(TAILDRIVE);
  assert.deepEqual(model.hosts, [{ name: "fileserver", cidr: "100.64.0.10/32" }]);
  assert.equal(model.acls.length, 2);
});

test("taildrive: nodeAttrs are extracted into the model", () => {
  const { model } = parsePolicy(TAILDRIVE);
  assert.deepEqual(
    model.nodeAttrs.map((e) => ({ target: e.target, attr: e.attr })),
    [
      { target: ["fileserver"], attr: ["drive:share"] },
      { target: ["autogroup:member"], attr: ["drive:access"] },
    ],
  );
});

test("taildrive: grants are extracted, the capability stays opaque", () => {
  const { model } = parsePolicy(TAILDRIVE);
  assert.equal(model.grants.length, 1);
  const grant = model.grants[0];
  assert.deepEqual(grant.src, ["autogroup:member"]);
  assert.deepEqual(grant.dst, ["fileserver"]);
  assert.deepEqual(grant.ip, [], "no ip key in the source -> empty list");
  assert.deepStrictEqual(grant.app, {
    "tailscale.com/cap/drive": [{ shares: ["*"], access: "rw" }],
  });
});

test("taildrive: editing an attr list leaves the rest of the document alone", () => {
  const { model, root } = parsePolicy(TAILDRIVE);
  model.nodeAttrs[0].attr = ["drive:share", "drive:access"];

  const after = JSON.parse(serializePolicy(model, root));
  assert.deepStrictEqual(after.nodeAttrs[0], {
    target: ["fileserver"],
    attr: ["drive:share", "drive:access"],
  });
  assert.deepStrictEqual(after.nodeAttrs[1], {
    target: ["autogroup:member"],
    attr: ["drive:access"],
  });
  assert.deepStrictEqual(after.grants, JSON.parse(roundTripPolicy(TAILDRIVE)).grants);
});

test("taildrive: editing a grant preserves its opaque capability payload", () => {
  const { model, root } = parsePolicy(TAILDRIVE);
  model.grants[0].src = ["autogroup:member", "tag:server"];

  const after = JSON.parse(serializePolicy(model, root));
  assert.deepEqual(after.grants[0].src, ["autogroup:member", "tag:server"]);
  assert.deepStrictEqual(after.grants[0].app, {
    "tailscale.com/cap/drive": [{ shares: ["*"], access: "rw" }],
  });
  assert.equal("ip" in after.grants[0], false, "an app-only grant must stay app-only");
});

test("taildrive: a section emptied by the operator stays present", () => {
  const { model, root } = parsePolicy(TAILDRIVE);
  model.grants = [];

  const after = JSON.parse(serializePolicy(model, root));
  assert.deepStrictEqual(after.grants, [], "the key existed, so it must remain");
});

// --- unit cases for single serializer branches ------------------------------

test("an empty document stays empty", () => {
  const { model, root } = parsePolicy("");
  assert.equal(serializePolicy(model, root), "{}");
});

test("unknown top-level keys pass through", () => {
  const after = JSON.parse(roundTripPolicy(`{ "randomizeClientPort": true, "acls": [] }`));
  assert.equal(after.randomizeClientPort, true);
});

/**
 * A grant may carry `app` without `ip` ("Optional if `app` provided" -- Tailscale
 * grants reference). Serializing must not invent an empty `ip: []`, which would
 * change the document the operator diffs against git.
 */
test("an app-only grant does not gain an empty ip field", () => {
  const src = `{
    "grants": [
      { "src": ["autogroup:member"], "dst": ["fileserver"], "app": { "example.com/cap/x": [{}] } }
    ]
  }`;
  const after = JSON.parse(roundTripPolicy(src));
  assert.equal("ip" in after.grants[0], false);
});

test("an ip-only grant keeps its ports and gains no app", () => {
  const src = `{ "grants": [ { "src": ["group:eng"], "dst": ["tag:db"], "ip": ["tcp:5432"] } ] }`;
  const { model, root } = parsePolicy(src);
  assert.deepEqual(model.grants[0].ip, ["tcp:5432"]);

  const after = JSON.parse(serializePolicy(model, root));
  assert.deepEqual(after.grants[0].ip, ["tcp:5432"]);
  assert.equal("app" in after.grants[0], false);
  assert.equal("via" in after.grants[0], false);
});

test("via and srcPosture survive on a grant", () => {
  const src = `{
    "grants": [
      {
        "src": ["group:eng"], "dst": ["10.0.0.0/8"], "ip": ["tcp:22"],
        "via": ["tag:router"], "srcPosture": ["posture:latest"]
      }
    ]
  }`;
  const { model, root } = parsePolicy(src);
  assert.deepEqual(model.grants[0].via, ["tag:router"]);

  const after = JSON.parse(serializePolicy(model, root));
  assert.deepEqual(after.grants[0].via, ["tag:router"]);
  assert.deepEqual(after.grants[0].srcPosture, ["posture:latest"], "unmodelled field survives");
});

test("a nodeAttrs entry carrying only app survives without an attr key", () => {
  const src = `{
    "nodeAttrs": [
      { "target": ["*"], "app": { "tailscale.com/app-connectors": [{ "name": "github" }] } }
    ]
  }`;
  const { model, root } = parsePolicy(src);
  assert.deepEqual(model.nodeAttrs[0].attr, []);

  const after = JSON.parse(serializePolicy(model, root));
  assert.equal("attr" in after.nodeAttrs[0], false);
  assert.deepStrictEqual(after.nodeAttrs[0].app, {
    "tailscale.com/app-connectors": [{ name: "github" }],
  });
});

test("unknown fields inside an acl rule pass through", () => {
  const src = `{
    "acls": [
      { "action": "accept", "src": ["a@"], "dst": ["*:*"], "srcPosture": ["posture:latest"] }
    ]
  }`;
  const after = JSON.parse(roundTripPolicy(src));
  assert.deepStrictEqual(after.acls[0].srcPosture, ["posture:latest"]);
});
