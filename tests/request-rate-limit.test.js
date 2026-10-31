import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequestRateLimiter } from "../request-rate-limit.js";

test("request limiter permits the configured count and resets after its window", () => {
  let now = 1_000;
  const allow = createRequestRateLimiter({
    limit: 2,
    windowMs: 100,
    maxKeys: 5,
    cleanupIntervalMs: 50,
    now: () => now,
  });

  assert.equal(allow("192.0.2.1"), true);
  assert.equal(allow("192.0.2.1"), true);
  assert.equal(allow("192.0.2.1"), false);
  now += 100;
  assert.equal(allow("192.0.2.1"), true);
});

test("request limiter bounds distinct keys and frees expired buckets", () => {
  let now = 1_000;
  const allow = createRequestRateLimiter({
    limit: 5,
    windowMs: 100,
    maxKeys: 2,
    cleanupIntervalMs: 50,
    now: () => now,
  });

  assert.equal(allow("198.51.100.1"), true);
  assert.equal(allow("198.51.100.2"), true);
  assert.equal(allow("198.51.100.3"), false);
  now += 100;
  assert.equal(allow("198.51.100.3"), true);
});

test("request limiter validates configuration", () => {
  assert.throws(
    () => createRequestRateLimiter({ limit: 0, windowMs: 10, maxKeys: 1 }),
    /limit must be a positive safe integer/,
  );
});
