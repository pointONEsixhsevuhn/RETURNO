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
