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
const submit = (cookie, post_id = found, evidence = proof, extra = {}) =>
  request("/api/claims", "POST", { post_id, evidence, ...extra }, cookie);

test("claims require student authentication and valid private proof", async () => {
  assert.equal((await submit()).status, 401);
  assert.equal((await submit(admin)).status, 403);
  assert.equal(
    (await request("/api/claims", "GET", undefined, admin)).status,
    403,
  );
  for (const evidence of [
    null,
    [],
    123,
    " ",
    "x".repeat(19),
    "x".repeat(2001),
    "x".repeat(20) + "\0",
  ])
    assert.equal((await submit(claimant, found, evidence)).status, 400);
  assert.equal((await submit(claimant, "missing")).status, 404);
  assert.equal((await submit(owner)).status, 403);
  assert.equal(db.prepare("SELECT count(*) n FROM claims").get().n, 0);
});
test("claims enforce Found eligibility without rewriting report statuses", async () => {
  for (const [kind, status] of [
    ["Lost", "Lost"],
    ["Found", "Claimed"],
    ["Found", "Returned"],
  ]) {
    db.prepare("UPDATE posts SET kind=?,status=? WHERE id=?").run(
      kind,
      status,
      found,
    );
    assert.equal((await submit(claimant)).status, 409);
    assert.equal(
      db.prepare("SELECT status FROM posts WHERE id=?").get(found).status,
      status,
    );
  }
  db.prepare("UPDATE posts SET kind='Found',status='Found' WHERE id=?").run(
    found,
  );
});
test("private claims use server identity/state and prevent simultaneous duplicates", async () => {
  const results = await Promise.all([
    submit(claimant, found, " " + proof + " ", {
      claimant_id: "forged",
      status: "Returned",
    }),
    submit(claimant),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  const claim = results.find((result) => result.status === 201).data.claim;
  assert.equal(claim.status, "Pending");
  assert.equal(claim.evidence, proof);
  assert.ok(claim.created_at);
  assert.equal((await submit(other, found, "x".repeat(2000))).status, 201);
  const mine = (await request("/api/claims", "GET", undefined, claimant)).data
    .claims;
  assert.equal(mine.length, 1);
  assert.equal(mine[0].id, claim.id);
  const theirs = (await request("/api/claims", "GET", undefined, other)).data
    .claims;
  assert.equal(theirs.length, 1);
  assert.notEqual(theirs[0].id, claim.id);
  assert.equal(
    (await request("/api/claims", "GET", undefined, owner)).data.claims.length,
    0,
  );
  assert.equal(
    (await request(`/api/claims/${claim.id}`, "GET", undefined, other)).status,
    404,
  );
  const posts = await request("/api/posts", "GET", undefined, other);
  assert.ok(!JSON.stringify(posts.data).includes(proof));
  assert.equal(
    (
      await request(
        `/api/posts?q=${encodeURIComponent(proof)}`,
        "GET",
        undefined,
        other,
      )
    ).data.posts.length,
    0,
  );
  assert.equal(
    (await request(`/api/posts/${found}`, "DELETE", undefined, admin)).status,
    409,
  );
  assert.equal(
    db.prepare("SELECT status FROM posts WHERE id=?").get(found).status,
    "Found",
  );
});
test("claim insert failures leave no partial claim and allow retry", async () => {
  const post = (
    await request(
      "/api/posts",
      "POST",
      {
        kind: "Found",
        item_name: "Book",
        event_at: "2026-10-08T12:00",
        location: "Gate",
        description: "Rollback test",
      },
      owner,
    )
  ).data.post.id;
  db.exec(
    "CREATE TRIGGER reject_claim BEFORE INSERT ON claims BEGIN SELECT RAISE(ABORT,'forced claim failure'); END;",
  );
  assert.equal((await submit(claimant, post)).status, 500);
  assert.equal(
    db.prepare("SELECT count(*) n FROM claims WHERE post_id=?").get(post).n,
    0,
  );
  db.exec("DROP TRIGGER reject_claim");
  assert.equal((await submit(claimant, post, "😀".repeat(20))).status, 201);
});
