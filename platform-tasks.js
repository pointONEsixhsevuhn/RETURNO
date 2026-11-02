import { attachDatabasePool, waitUntil } from "@vercel/functions";

// Keep post-response work alive on Vercel Functions. Local development keeps
// the existing fire-and-forget behavior because its Node server stays running.
export async function scheduleAfterResponse(task, options = {}) {
  const isVercel = options.isVercel ?? process.env.VERCEL === "1";
  if (!isVercel) {
    void task;
    return;
  }

  const schedule = options.waitUntil ?? waitUntil;
  schedule(task);
}

// Vercel can freeze a warm function between requests. Its helper gives pooled
// database clients a chance to close idle connections before that happens.
export function attachVercelDatabasePool(pool, options = {}) {
  const isVercel = options.isVercel ?? process.env.VERCEL === "1";
  if (isVercel) (options.attach ?? attachDatabasePool)(pool);
}
