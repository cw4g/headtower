/**
 * Request-shape helper tests.
 *
 * Runs on plain Node (`node --test`); see policy/model.test.ts for why there is
 * no test runner.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { originFromHeaders, publicRequestUrl } from "./request";

const PUBLIC = "https://headtower.example";
// What `request.url` looks like inside a Route Handler behind a reverse proxy:
// the container's bind address, not the host the browser asked for.
const INTERNAL = "https://0.0.0.0:3000/login/callback?code=abc&state=xyz";

test("forwarded headers win over the raw Host", () => {
  const headers = new Headers({
    host: "10.42.0.7:3000",
    "x-forwarded-host": "headtower.example",
    "x-forwarded-proto": "https",
  });
  assert.equal(originFromHeaders(headers), PUBLIC);
});

test("the first value of a chained x-forwarded-proto is used", () => {
  const headers = new Headers({
    "x-forwarded-host": "headtower.example",
    "x-forwarded-proto": "https, http",
  });
  assert.equal(originFromHeaders(headers), PUBLIC);
});

test("a request without any host is refused rather than guessed", () => {
  assert.throws(() => originFromHeaders(new Headers()), /Cannot determine the request host/);
});

test("the callback URL is re-homed onto the public origin", () => {
  // The redirect_uri derived from this must be the public one, or the provider
  // rejects the token exchange as a mismatch against the authorize request.
  assert.equal(
    publicRequestUrl(INTERNAL, PUBLIC).toString(),
    "https://headtower.example/login/callback?code=abc&state=xyz",
  );
});

test("query parameters survive, so state and code still validate", () => {
  const url = publicRequestUrl(INTERNAL, PUBLIC);
  assert.equal(url.searchParams.get("code"), "abc");
  assert.equal(url.searchParams.get("state"), "xyz");
});

test("a sub-path mount is preserved", () => {
  // HEADTOWER_BASE_PATH is already part of the incoming path, so it must not be
  // stripped or doubled.
  assert.equal(
    publicRequestUrl("http://0.0.0.0:3000/admin/login/callback?code=1", PUBLIC).toString(),
    "https://headtower.example/admin/login/callback?code=1",
  );
});

test("an already-public request URL is unchanged", () => {
  const same = `${PUBLIC}/login/callback?code=1`;
  assert.equal(publicRequestUrl(same, PUBLIC).toString(), same);
});

test("the origin's scheme and port replace the internal ones", () => {
  assert.equal(
    publicRequestUrl(INTERNAL, "http://localhost:8080").toString(),
    "http://localhost:8080/login/callback?code=abc&state=xyz",
  );
});
