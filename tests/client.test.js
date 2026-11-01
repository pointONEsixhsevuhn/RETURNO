import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const source = await readFile(
  new URL("../public/api.js", import.meta.url),
  "utf8",
);
function client(fetch, timers = {}) {
  const ctx = vm.createContext({
    fetch,
    AbortController,
    setTimeout: timers.setTimeout || setTimeout,
    clearTimeout: timers.clearTimeout || clearTimeout,
  });
  vm.runInContext(source, ctx);
  return ctx.RetornoAPI.request;
}
test("wrong static server gives setup instructions instead of a JSON parsing error", async () => {
  const api = client(
    async () =>
      new Response("<html>Not Found</html>", {
        status: 404,
        headers: { "Content-Type": "text/html" },
      }),
  );
  await assert.rejects(
    api("/register", { method: "POST", body: "{}" }),
    (e) =>
      e.code === "WRONG_SERVER" &&
      /npm start/.test(e.message) &&
      /Live Server/.test(e.message),
  );
});
test("disconnected backend gives actionable error without retrying registration", async () => {
  let calls = 0;
  const api = client(async () => {
    calls++;
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(
    api("/register", { method: "POST", body: "{}" }),
    (e) =>
      e.code === "CONNECTION" &&
      /Cannot connect/.test(e.message) &&
      /Check your connection/.test(e.message) &&
      /For a local installation/.test(e.message) &&
      !/localhost:3000/.test(e.message),
  );
  assert.equal(calls, 1);
});
test("JSON validation errors preserve the server message and status", async () => {
  const api = client(async () =>
    Response.json({ error: "Passwords do not match." }, { status: 400 }),
  );
  await assert.rejects(
    api("/register"),
    (e) => e.status === 400 && e.message === "Passwords do not match.",
  );
});
test("API sends same-origin credentials and accepts created accounts", async () => {
  const api = client(async (url, options) => {
    assert.equal(url, "/api/register");
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.method, "POST");
    return Response.json(
      { user: { id: "new", role: "student" } },
      { status: 201 },
    );
  });
  assert.equal(
    (await api("/register", { method: "POST", body: "{}" })).user.id,
    "new",
  );
});

test("post and proof-image submissions get enough time for large tunnel uploads", async () => {
  const delays = [];
  let finish;
  const api = client(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    {
      setTimeout(callback, delay) {
        delays.push(delay);
        return { callback };
      },
      clearTimeout() {},
    },
  );

  const pending = api("/posts", {
    method: "POST",
    body: "large image payload",
  });
  assert.deepEqual(delays, [90000]);
  finish(Response.json({ post: { id: "created" } }, { status: 201 }));
  assert.equal((await pending).post.id, "created");

  const proof = api("/posts/post-id/outcome-notifications", {
    method: "POST",
    body: "large proof image payload",
  });
  assert.deepEqual(delays, [90000, 90000]);
  finish(Response.json({ ok: true }, { status: 201 }));
  await proof;
});

test("ordinary requests keep the short timeout", async () => {
  let delay;
  const api = client(async () => Response.json({ ok: true }), {
    setTimeout(_callback, ms) {
      delay = ms;
      return 1;
    },
    clearTimeout() {},
  });
  await api("/health");
  assert.equal(delay, 15000);
});
