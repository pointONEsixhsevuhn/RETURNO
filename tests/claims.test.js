import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
let db, server, directory, base, owner, claimant, other, admin, found;
const proof = "Private ownership mark inside the lining";
async function request(route, method = "GET", data, cookie) {
  const response = await fetch(base + route, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "retorno-claims-"));
  process.env.DATA_DIR = directory;
  process.env.NODE_ENV = "test";
  ({ server } = await import("../server.js"));
  let createUser;
  ({ db, createUser } = await import("../db.js"));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [name, role] of [
    ["owner", "student"],
    ["claimant", "student"],
    ["other", "student"],
    ["admin", "admin"],
  ])
    createUser(`${name}@claims.example`, name, "ClaimsTest123!", role);
  const signIn = async (name, role = "student") =>
    (
      await request("/api/login", "POST", {
        email: `${name}@claims.example`,
        password: "ClaimsTest123!",
        role,
      })
    ).cookie;
  owner = await signIn("owner");
  claimant = await signIn("claimant");
  other = await signIn("other");
  admin = await signIn("admin", "admin");
  found = (
    await request(
      "/api/posts",
      "POST",
      {
        kind: "Found",
        item_name: "Wallet",
        event_at: "2026-10-08T12:00",
        location: "Gate",
        description: "Public description",
      },
      owner,
    )
  ).data.post.id;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  await rm(directory, { recursive: true, force: true });
});

test("student claim endpoints are removed and administrators manage reports", async () => {
  for (const cookie of [owner, claimant, admin]) {
    assert.equal(
      (await request("/api/claims", "GET", undefined, cookie)).status,
      404,
    );
    assert.equal(
      (
        await request(
          "/api/claims",
          "POST",
          { post_id: found, evidence: proof },
          cookie,
        )
      ).status,
      404,
    );
  }
  assert.equal(
    (
      await request(
        `/api/posts/${found}`,
        "PATCH",
        { status: "Claimed" },
        claimant,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/api/posts/${found}`,
        "PATCH",
        { status: "Claimed" },
        admin,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        `/api/posts/${found}`,
        "PATCH",
        { status: "Returned" },
        admin,
      )
    ).status,
    200,
  );
  assert.equal(
    (await request(`/api/posts/${found}`, "DELETE", undefined, admin)).status,
    200,
  );
  assert.equal(
    db.prepare("SELECT name FROM sqlite_master WHERE name='claims'").get(),
    undefined,
  );
});
