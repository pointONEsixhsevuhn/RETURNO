import test from "node:test";
import assert from "node:assert/strict";
import {
  attachVercelDatabasePool,
  scheduleAfterResponse,
} from "../platform-tasks.js";

test("Vercel post-response tasks are registered with waitUntil", async () => {
  let registered;
  const task = Promise.resolve("sent");

  await scheduleAfterResponse(task, {
    isVercel: true,
    waitUntil(value) {
      registered = value;
    },
  });

  assert.equal(registered, task);
  assert.equal(await registered, "sent");
});

test("local post-response tasks do not delay the request", async () => {
  let finish;
  const task = new Promise((resolve) => {
    finish = resolve;
  });

  await scheduleAfterResponse(task, { isVercel: false });
  finish();
  await task;
});

test("Vercel Postgres pools are attached to the idle connection lifecycle", () => {
  const pool = {};
  let attached;

  attachVercelDatabasePool(pool, {
    isVercel: true,
    attach(value) {
      attached = value;
    },
  });

  assert.equal(attached, pool);
});

test("local database pools do not register a Vercel lifecycle hook", () => {
  let called = false;

  attachVercelDatabasePool({}, {
    isVercel: false,
    attach() {
      called = true;
    },
  });

  assert.equal(called, false);
});
