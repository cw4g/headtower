/**
 * Update-check configuration tests.
 *
 * Runs on plain Node (`node --test`); see policy/model.test.ts for why there is
 * no test runner.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { updateCheckConfig } from "./version";

const UPSTREAM = "https://headtower.niheshr.com/version.json";

test("an empty environment keeps the previous behaviour", () => {
  assert.deepEqual(updateCheckConfig({}), { enabled: true, url: UPSTREAM });
});

test("a custom URL replaces the default", () => {
  const cfg = updateCheckConfig({ HEADTOWER_VERSION_URL: "https://example.com/v.json" });
  assert.equal(cfg.url, "https://example.com/v.json");
  assert.equal(cfg.enabled, true);
});

test("surrounding whitespace is ignored", () => {
  assert.equal(
    updateCheckConfig({ HEADTOWER_VERSION_URL: "  https://example.com/v.json  " }).url,
    "https://example.com/v.json",
  );
});

/** Compose writes an empty string for an unset variable; that must not disable. */
test("an empty URL falls back to the default", () => {
  assert.equal(updateCheckConfig({ HEADTOWER_VERSION_URL: "" }).url, UPSTREAM);
  assert.equal(updateCheckConfig({ HEADTOWER_VERSION_URL: "   " }).url, UPSTREAM);
});

test("the check can be switched off", () => {
  assert.equal(updateCheckConfig({ HEADTOWER_UPDATE_CHECK: "false" }).enabled, false);
  assert.equal(updateCheckConfig({ HEADTOWER_UPDATE_CHECK: "FALSE" }).enabled, false);
  assert.equal(updateCheckConfig({ HEADTOWER_UPDATE_CHECK: " false " }).enabled, false);
});

/** Only "false" disables: a typo must not silently switch the check off. */
test("any other value leaves the check on", () => {
  for (const value of ["true", "", "0", "no", "off", "yes"]) {
    assert.equal(
      updateCheckConfig({ HEADTOWER_UPDATE_CHECK: value }).enabled,
      true,
      `"${value}" should not disable the check`,
    );
  }
});

test("the two variables are independent", () => {
  const cfg = updateCheckConfig({
    HEADTOWER_UPDATE_CHECK: "false",
    HEADTOWER_VERSION_URL: "https://example.com/v.json",
  });
  assert.equal(cfg.enabled, false);
  assert.equal(cfg.url, "https://example.com/v.json");
});
