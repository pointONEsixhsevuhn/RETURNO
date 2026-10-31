import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPostgresRequestRateLimiter,
  createRequestRateLimiter,
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

function sharedRateLimitStore() {
  const rows = new Map();
  let locked = false;
  const waiters = [];
  function acquire() {
    if (!locked) {
      locked = true;
      return Promise.resolve();
    }
    return new Promise(resolve => waiters.push(resolve));
  }
  function release() {
    const next = waiters.shift();
    if (next) next();
    else locked = false;
  }
  return {
    rows,
    exec: async statement => {
      if (statement === "BEGIN") return;
      if (statement === "COMMIT" || statement === "ROLLBACK") release();
    },
    prepare: statement => ({
      get: async (...values) => {
        if (statement.includes("pg_advisory_xact_lock")) {
          await acquire();
          return {};
        }
        if (statement.includes("SELECT key_hash")) {
          const row = rows.get(values[0]);
          return row ? { key_hash: values[0] } : undefined;
        }
        if (statement.includes("COUNT(*)")) return { total: rows.size };
        if (statement.includes("INSERT INTO request_rate_limits")) {
          const [keyHash, startedAt, expiresAt, windowMs, currentTime, newStart,
            , , , , newExpiry] = values;
          const previous = rows.get(keyHash);
          const reset = !previous || previous.window_started_at + windowMs <= currentTime;
          const row = reset
            ? { window_started_at: newStart, request_count: 1, expires_at: newExpiry }
            : { ...previous, request_count: previous.request_count + 1 };
          if (!previous && !reset) row.expires_at = expiresAt;
          rows.set(keyHash, row);
          return { request_count: row.request_count };
        }
        throw new Error(`Unexpected mock query: ${statement}`);
      },
      run: async (...values) => {
        if (statement.includes("DELETE FROM request_rate_limits")) {
          for (const [key, row] of rows) if (row.expires_at <= values[0]) rows.delete(key);
          return { changes: 0 };
        }
        throw new Error(`Unexpected mock query: ${statement}`);
      },
    }),
  };
}

test("Postgres limiter shares atomic counts across instances and bounds active keys", async () => {
  let now = 1_000;
  const db = sharedRateLimitStore();
  const options = { db, limit: 2, windowMs: 100, maxKeys: 1, now: () => now };
  const instanceA = createPostgresRequestRateLimiter(options);
  const instanceB = createPostgresRequestRateLimiter(options);
  const firstIp = "a".repeat(64);
  const secondIp = "b".repeat(64);

  assert.equal(await instanceA(firstIp), true);
  assert.equal(await instanceB(firstIp), true);
  assert.equal(await instanceA(firstIp), false);
  assert.equal(await instanceB(secondIp), false);
  now += 100;
  assert.equal(await instanceB(secondIp), true);
  assert.equal(db.rows.size, 1);
});

test("Postgres limiter serializes concurrent attempts and fails closed on database errors", async () => {
  const db = sharedRateLimitStore();
  const allowA = createPostgresRequestRateLimiter({
    db, limit: 40, windowMs: 900_000, maxKeys: 100, now: () => 10_000,
  });
  const allowB = createPostgresRequestRateLimiter({
    db, limit: 40, windowMs: 900_000, maxKeys: 100, now: () => 10_000,
  });
  const outcomes = await Promise.all(Array.from({ length: 50 }, (_, index) =>
    (index % 2 ? allowA : allowB)("c".repeat(64))));
  assert.equal(outcomes.filter(Boolean).length, 40);
  assert.equal(db.rows.get("c".repeat(64)).request_count, 50);

  const broken = createPostgresRequestRateLimiter({
    db: { exec: async statement => { if (statement === "BEGIN") throw new Error("offline"); }, prepare: () => ({}) },
    limit: 2, windowMs: 100, maxKeys: 1,
  });
  await assert.rejects(() => broken("d".repeat(64)), /offline/);
});
