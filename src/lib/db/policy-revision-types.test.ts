/**
 * Policy revision state tests.
 *
 * Runs on plain Node (`node --test`); see policy/model.test.ts for why there is
 * no test runner. These cover the pure half only - the store itself talks to
 * SQLite through `./client`, and importing that in a test would open a real
 * database file.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  NOTE_MAX_LENGTH,
  normalizeNote,
  revisionState,
  stateMeta,
} from "./policy-revision-types";

const LIVE = "a".repeat(64);
const OTHER = "b".repeat(64);

test("the document the control plane serves is live", () => {
  assert.equal(revisionState({ digest: LIVE, lastDeployedAt: null }, LIVE), "live");
});

test("live does not require ever having been deployed from here", () => {
  // The baseline captured from the control plane on first load was never pushed
  // by us, yet it is plainly what is running.
  assert.equal(revisionState({ digest: LIVE, lastDeployedAt: null }, LIVE), "live");
});

test("a superseded revision reads as was-live, not draft", () => {
  assert.equal(
    revisionState({ digest: OTHER, lastDeployedAt: new Date(1) }, LIVE),
    "deployed",
  );
});

test("a never-pushed revision is a draft", () => {
  assert.equal(revisionState({ digest: OTHER, lastDeployedAt: null }, LIVE), "draft");
});

test("an out-of-band change leaves NO revision claiming to be live", () => {
  // Someone edited the policy with the Headscale CLI: the live digest matches
  // nothing we stored. Every row must fall back to its own history, and the
  // absence of a "live" chip is the signal that control was lost.
  const rows = [
    { digest: OTHER, lastDeployedAt: new Date(2) },
    { digest: "c".repeat(64), lastDeployedAt: null },
  ];
  const states = rows.map((r) => revisionState(r, "d".repeat(64)));
  assert.deepEqual(states, ["deployed", "draft"]);
  assert.ok(!states.includes("live"));
});

test("an unreadable live policy does not fabricate a live row", () => {
  // liveDigest is null when the control plane could not be read at all.
  assert.equal(revisionState({ digest: LIVE, lastDeployedAt: new Date(3) }, null), "deployed");
  assert.equal(revisionState({ digest: LIVE, lastDeployedAt: null }, null), "draft");
});

test("epoch-ms timestamps classify the same as Date ones", () => {
  // The view type carries epoch-ms across the server/client boundary.
  assert.equal(revisionState({ digest: OTHER, lastDeployedAt: 1 }, LIVE), "deployed");
  // 0 is a real timestamp, not "absent" - a `!` check here would misread it.
  assert.equal(revisionState({ digest: OTHER, lastDeployedAt: 0 }, LIVE), "deployed");
});

test("every state has distinct chip copy", () => {
  const labels = (["live", "deployed", "draft"] as const).map((s) => stateMeta(s).label);
  assert.equal(new Set(labels).size, 3);
});

test("a blank note becomes null rather than an empty label", () => {
  assert.equal(normalizeNote(""), null);
  assert.equal(normalizeNote("   "), null);
  assert.equal(normalizeNote(null), null);
  assert.equal(normalizeNote(undefined), null);
});

test("a note is trimmed and capped", () => {
  assert.equal(normalizeNote("  before the guest tag  "), "before the guest tag");
  assert.equal(normalizeNote("x".repeat(500))?.length, NOTE_MAX_LENGTH);
});
