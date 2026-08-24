/**
 * Node-view tests, focused on the exit-node state.
 *
 * Runs on plain Node (`node --test`); the `@/` alias is resolved by
 * test/ts-resolve.mjs. See policy/model.test.ts for why there is no test runner.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { toNodeView } from "./machines";
import type { Node } from "@/lib/headscale";

const NOW = Date.parse("2026-08-24T12:00:00Z");

/** A minimal node; route fields are supplied per case. */
function nodeWith(routes: Partial<Node>): Node {
  return {
    id: "1",
    name: "host",
    givenName: "host",
    online: true,
    ipAddresses: ["100.64.0.9"],
    ...routes,
  } as Node;
}

const viewOf = (routes: Partial<Node>) => toNodeView(nodeWith(routes), NOW);

/**
 * The case that motivated this: Headscale reports `subnetRoutes` differently for
 * the node list and for a single node, so a working exit node rendered as
 * "Active" in one view and "pending approval" in the other. The approved set is
 * consistent, so it has to carry the verdict.
 */
test("an approved exit node is active even when subnetRoutes omits it", () => {
  const view = viewOf({
    availableRoutes: ["0.0.0.0/0", "::/0"],
    approvedRoutes: ["0.0.0.0/0", "::/0"],
    subnetRoutes: [],
  });
  assert.equal(view.isExitNode, true);
  assert.equal(view.advertisesExit, false);
});

test("subnetRoutes alone still suffices", () => {
  const view = viewOf({
    availableRoutes: ["0.0.0.0/0"],
    approvedRoutes: [],
    subnetRoutes: ["0.0.0.0/0"],
  });
  assert.equal(view.isExitNode, true);
});

test("advertised but unapproved stays pending", () => {
  const view = viewOf({
    availableRoutes: ["0.0.0.0/0", "::/0"],
    approvedRoutes: [],
    subnetRoutes: [],
  });
  assert.equal(view.isExitNode, false);
  assert.equal(view.advertisesExit, true);
});

/** Approving a default route without advertising it must not invent an exit node. */
test("approved but not advertised is not an exit node", () => {
  const view = viewOf({
    availableRoutes: [],
    approvedRoutes: ["0.0.0.0/0"],
    subnetRoutes: [],
  });
  assert.equal(view.isExitNode, false);
  assert.equal(view.advertisesExit, false);
});

test("a plain subnet router is no exit node", () => {
  const view = viewOf({
    availableRoutes: ["10.0.2.0/24"],
    approvedRoutes: ["10.0.2.0/24"],
    subnetRoutes: ["10.0.2.0/24"],
  });
  assert.equal(view.isExitNode, false);
  assert.equal(view.advertisesExit, false);
  assert.deepEqual(view.subnetRoutes, ["10.0.2.0/24"]);
});

/** The default routes belong to the exit-node flag, not to the subnet list. */
test("default routes are kept out of subnetRoutes", () => {
  const view = viewOf({
    availableRoutes: ["0.0.0.0/0", "::/0", "10.0.2.0/24"],
    approvedRoutes: ["0.0.0.0/0", "::/0", "10.0.2.0/24"],
    subnetRoutes: ["0.0.0.0/0", "::/0", "10.0.2.0/24"],
  });
  assert.equal(view.isExitNode, true);
  assert.deepEqual(view.subnetRoutes, ["10.0.2.0/24"]);
});

/** A standby subnet router: approved, but another node serves the prefix. */
test("an approved route that is not served shows as approved, not pending", () => {
  const view = viewOf({
    availableRoutes: ["10.0.2.0/24"],
    approvedRoutes: ["10.0.2.0/24"],
    subnetRoutes: [],
  });
  assert.deepEqual(view.subnetRoutes, [], "nothing served");
  assert.deepEqual(view.pendingRoutes, [], "approved, so not pending either");
});

/**
 * `GET /v1/node/{id}` omits `subnetRoutes`, so a detail page that trusted it
 * announced "none served" for a node that was serving the route. The approved set
 * is the honest fallback.
 */
test("approved subnets are reported even when subnetRoutes is empty", () => {
  const view = viewOf({
    availableRoutes: ["0.0.0.0/0", "::/0", "10.0.2.0/24"],
    approvedRoutes: ["0.0.0.0/0", "::/0", "10.0.2.0/24"],
    subnetRoutes: [],
  });
  assert.deepEqual(view.subnetRoutes, [], "nothing reported as served");
  assert.deepEqual(view.approvedSubnets, ["10.0.2.0/24"], "but it is approved");
});

test("approvedSubnets excludes the default routes", () => {
  const view = viewOf({
    availableRoutes: ["0.0.0.0/0", "::/0"],
    approvedRoutes: ["0.0.0.0/0", "::/0"],
    subnetRoutes: [],
  });
  assert.deepEqual(view.approvedSubnets, []);
  assert.equal(view.isExitNode, true, "the default routes belong to the exit flag");
});

test("approvedSubnets is sorted and holds only approved prefixes", () => {
  const view = viewOf({
    availableRoutes: ["192.168.5.0/24", "10.0.2.0/24"],
    approvedRoutes: ["192.168.5.0/24"],
    subnetRoutes: [],
  });
  assert.deepEqual(view.approvedSubnets, ["192.168.5.0/24"]);
  assert.deepEqual(view.pendingRoutes, ["10.0.2.0/24"]);
});

test("an unapproved subnet route is pending", () => {
  const view = viewOf({
    availableRoutes: ["10.0.2.0/24"],
    approvedRoutes: [],
    subnetRoutes: [],
  });
  assert.deepEqual(view.pendingRoutes, ["10.0.2.0/24"]);
});
