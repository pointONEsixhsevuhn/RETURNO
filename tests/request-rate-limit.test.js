import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRequestRateLimiter,
  requestClientAddress,
} from "../request-rate-limit.js";

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

test("Cloudflare client IP is trusted only for the explicitly enabled loopback tunnel", () => {
  const tunneledRequest = {
    socket: { remoteAddress: "127.0.0.1" },
    headers: { "cf-connecting-ip": "203.0.113.8", "x-forwarded-for": "198.51.100.9" },
  };
  assert.equal(requestClientAddress(tunneledRequest), "127.0.0.1");
  assert.equal(
    requestClientAddress(tunneledRequest, { trustCloudflareTunnel: true }),
    "203.0.113.8",
  );
  assert.equal(
    requestClientAddress(
      { socket: { remoteAddress: "198.51.100.4" }, headers: tunneledRequest.headers },
      { trustCloudflareTunnel: true },
    ),
    "198.51.100.4",
  );
  assert.equal(
    requestClientAddress(
      {
        socket: { remoteAddress: "127.0.0.1" },
        headers: { "cf-connecting-ip": "not-an-ip" },
      },
      { trustCloudflareTunnel: true },
    ),
    "127.0.0.1",
  );
});

test("separate tunnel visitors receive separate sensitive-request buckets", () => {
  const allow = createRequestRateLimiter({
    limit: 1,
    windowMs: 100,
    maxKeys: 5,
  });
  const address = (ip) =>
    requestClientAddress(
      { socket: { remoteAddress: "127.0.0.1" }, headers: { "cf-connecting-ip": ip } },
      { trustCloudflareTunnel: true },
    );

  assert.equal(allow(address("203.0.113.1")), true);
  assert.equal(allow(address("203.0.113.1")), false);
  assert.equal(allow(address("203.0.113.2")), true);
});
