import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const source = await readFile(
  new URL("../public/api.js", import.meta.url),
  "utf8",
);
function client(fetch) {
  const ctx = vm.createContext({
    fetch,
    AbortController,
    setTimeout,
    clearTimeout,
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
    (e) => e.code === "CONNECTION" && /Cannot connect/.test(e.message),
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
