import { isIP } from "node:net";

function isLoopback(address) {
  if (typeof address !== "string") return false;
  if (address === "::1" || address.toLowerCase().startsWith("::ffff:127."))
    return true;
  const octets = address.split(".").map(Number);
  return (
    octets.length === 4 &&
    octets[0] === 127 &&
    octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
  );
}

export function requestClientAddress(req, { trustCloudflareTunnel = false } = {}) {
  const remote = req.socket?.remoteAddress;
  if (trustCloudflareTunnel && isLoopback(remote)) {
    const cloudflareAddress = req.headers?.["cf-connecting-ip"];
    if (typeof cloudflareAddress === "string" && isIP(cloudflareAddress))
      return cloudflareAddress;
  }
  return typeof remote === "string" && isIP(remote) ? remote : "unknown";
}

export function createRequestRateLimiter({
  limit,
  windowMs,
  maxKeys,
  cleanupIntervalMs = 60_000,
  now = Date.now,
}) {
  for (const [name, value] of Object.entries({
    limit,
    windowMs,
    maxKeys,
    cleanupIntervalMs,
  })) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new TypeError(`${name} must be a positive safe integer.`);
  }

  const buckets = new Map();
  let nextCleanupAt = 0;
  let nextCapacityCleanupAt = 0;

  function removeExpired(currentTime) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= currentTime) buckets.delete(key);
    }
    nextCleanupAt = currentTime + cleanupIntervalMs;
  }

  return function allow(key) {
    const currentTime = now();
    if (currentTime >= nextCleanupAt) removeExpired(currentTime);

    const normalizedKey = String(key || "unknown");
    let bucket = buckets.get(normalizedKey);
    if (bucket?.resetAt <= currentTime) {
      buckets.delete(normalizedKey);
      bucket = undefined;
    }

    if (!bucket) {
      if (buckets.size >= maxKeys) {
        // At capacity, make one immediate cleanup attempt. If every key is
        // still active, fail closed until a later cleanup rather than grow.
        if (currentTime >= nextCapacityCleanupAt) {
          removeExpired(currentTime);
          nextCapacityCleanupAt = currentTime + cleanupIntervalMs;
        }
        if (buckets.size >= maxKeys) return false;
      }
      bucket = { count: 0, resetAt: currentTime + windowMs };
      buckets.set(normalizedKey, bucket);
    }

    bucket.count += 1;
    return bucket.count <= limit;
  };
}

export function createPostgresRequestRateLimiter({
  db,
  limit,
  windowMs,
  maxKeys,
  now = Date.now,
}) {
  for (const [name, value] of Object.entries({ limit, windowMs, maxKeys })) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new TypeError(`${name} must be a positive safe integer.`);
  }
  if (!db || typeof db.exec !== "function" || typeof db.prepare !== "function")
    throw new TypeError("db must support exec() and prepare().");

  return async function allow(keyHash) {
    if (typeof keyHash !== "string" || !/^[a-f0-9]{64}$/.test(keyHash))
      throw new TypeError("keyHash must be a SHA-256 HMAC in hexadecimal.");
    const currentTime = now();
    await db.exec("BEGIN");
    try {
      // Serializing the small set of sensitive routes makes the active-key cap
      // safe across separate Vercel function instances.
      await db.prepare("SELECT pg_advisory_xact_lock(1414676826, 1)").get();
      await db
        .prepare("DELETE FROM request_rate_limits WHERE expires_at <= ?")
        .run(currentTime);
      const existing = await db
        .prepare("SELECT key_hash FROM request_rate_limits WHERE key_hash = ?")
        .get(keyHash);
      if (!existing) {
        const { total } = await db
          .prepare("SELECT COUNT(*) AS total FROM request_rate_limits")
          .get();
        if (Number(total) >= maxKeys) {
          await db.exec("COMMIT");
          return false;
        }
      }
      const row = await db
        .prepare(`INSERT INTO request_rate_limits
          (key_hash, window_started_at, request_count, expires_at)
          VALUES (?, ?, 1, ?)
          ON CONFLICT (key_hash) DO UPDATE SET
            window_started_at = CASE
              WHEN request_rate_limits.window_started_at + ? <= ? THEN ?
              ELSE request_rate_limits.window_started_at END,
            request_count = CASE
              WHEN request_rate_limits.window_started_at + ? <= ? THEN 1
              ELSE request_rate_limits.request_count + 1 END,
            expires_at = CASE
              WHEN request_rate_limits.window_started_at + ? <= ? THEN ?
              ELSE request_rate_limits.expires_at END
          RETURNING request_count`)
        .get(
          keyHash,
          currentTime,
          currentTime + windowMs,
          windowMs,
          currentTime,
          currentTime,
          windowMs,
          currentTime,
          windowMs,
          currentTime,
          currentTime + windowMs,
        );
      await db.exec("COMMIT");
      return Number(row?.request_count) <= limit;
    } catch (error) {
      try {
        await db.exec("ROLLBACK");
      } catch {}
      throw error;
    }
  };
}
