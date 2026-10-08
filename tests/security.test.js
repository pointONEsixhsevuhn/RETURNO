import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { authorize, postReadScope } from "../access-control.js";
let db, handler, directory, student, second, admin, studentId, adminId, postId;
const details = {
  kind: "Found",
  item_name: "Security wallet",
  event_at: "2026-10-08T12:00",
  location: "Gate",
  description: "Security test",
};
async function send(url, method = "GET", data, cookie, duringBody) {
  const req = Readable.from(
    (async function* () {
      if (duringBody) duringBody();
      if (data !== undefined) yield Buffer.from(JSON.stringify(data));
    })(),
  );
  Object.assign(req, {
    url,
    method,
    headers: {
      host: "localhost:3000",
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    socket: { remoteAddress: "127.0.0.1" },
  });
  let status,
    payload,
    headers = {};
  const res = {
    headersSent: false,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    writeHead(code, fields = {}) {
      status = code;
      Object.assign(headers, fields);
      this.headersSent = true;
    },
    end(value) {
      payload = value;
    },
  };
  await handler(req, res);
  return {
    status,
    data: JSON.parse(payload),
    cookie: headers["set-cookie"]?.split(";")[0],
  };
}
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "retorno-security-"));
  process.env.DATA_DIR = directory;
  process.env.NODE_ENV = "test";
  const { server } = await import("../server.js");
  handler = server.listeners("request")[0];
  let createUser;
  ({ db, createUser } = await import("../db.js"));
  studentId = createUser(
    "student@security.example",
    "Student",
    "Security123!",
    "student",
  );
  createUser("second@security.example", "Second", "Security123!", "student");
  adminId = createUser(
    "admin@security.example",
    "Admin",
    "Security123!",
    "admin",
  );
  const login = async (email, role) =>
    (
      await send("/api/login", "POST", {
        email,
        password: "Security123!",
        role,
      })
    ).cookie;
  student = await login("student@security.example", "student");
  second = await login("second@security.example", "student");
  admin = await login("admin@security.example", "admin");
  postId = (await send("/api/posts", "POST", details, student)).data.post.id;
});
after(async () => {
  db.close();
  await rm(directory, { recursive: true, force: true });
});

test("permissions deny unknown roles/actions and require authenticated identity", () => {
  for (const actor of [
    null,
    { id: "x", role: "superadmin" },
    { role: "admin" },
    { id: "x", role: "__proto__" },
  ])
    assert.throws(() => authorize(actor, "posts.manage"), { status: 403 });
  assert.throws(() => authorize({ id: "x", role: "admin" }, "unknown"), {
    status: 403,
  });
  assert.deepEqual(postReadScope({ id: "trusted", role: "student" }, true), {
    sql: "p.user_id=?",
    params: ["trusted"],
  });
});
test("role gates precede row lookup and students cannot manage any report", async () => {
  assert.equal((await send("/assets/originals/id.png")).status, 404);
  assert.equal((await send("/ASSETS/ORIGINALS/id.png")).status, 404);
  for (const id of [postId, "missing-row"])
    for (const method of ["GET", "PUT", "PATCH", "DELETE"])
      assert.equal(
        (
          await send(
            `/api/posts/${id}`,
            method,
            method === "PUT" ? details : { status: "Returned" },
            student,
          )
        ).status,
        403,
      );
  for (const route of ["/api/users", "/api/stats"])
    assert.equal((await send(route, "GET", undefined, student)).status, 403);
  assert.equal((await send("/api/admins", "POST", {}, student)).status, 403);
  assert.equal((await send("/api/posts", "POST", details, admin)).status, 403);
  assert.equal(
    (await send("/api/unknown", "GET", undefined, admin)).status,
    404,
  );
});
test("own rows use session identity and creation ignores forged ownership/status", async () => {
  const response = await send(
    "/api/posts",
    "POST",
    { ...details, user_id: adminId, role: "admin", status: "Returned" },
    student,
  );
  assert.equal(response.status, 201);
  assert.equal(response.data.post.user_id, studentId);
  assert.equal(response.data.post.status, "Found");
  assert.equal(
    (
      await send(
        `/api/posts?mine=1&user_id=${studentId}`,
        "GET",
        undefined,
        second,
      )
    ).data.posts.length,
    0,
  );
  assert.ok(
    (await send("/api/posts", "GET", undefined, second)).data.posts.length >= 2,
  );
  assert.equal(
    (
      await send(
        `/api/posts/${postId}`,
        "PUT",
        { ...details, user_id: adminId },
        admin,
      )
    ).data.post.user_id,
    studentId,
  );
});
test("SQL payloads remain literal in writes/search and cannot bypass login or row scopes", async () => {
  const payload = "' OR 1=1; DROP TABLE users; --";
  const created = await send(
    "/api/posts",
    "POST",
    { ...details, item_name: payload, description: payload },
    student,
  );
  assert.equal(created.status, 201);
  assert.equal(created.data.post.item_name, payload);
  const searched = await send(
    `/api/posts?q=${encodeURIComponent(payload)}`,
    "GET",
    undefined,
    second,
  );
  assert.equal(searched.data.posts.length, 1);
  assert.equal(searched.data.posts[0].id, created.data.post.id);
  assert.equal(
    (
      await send(
        `/api/posts?mine=1&q=${encodeURIComponent(payload)}`,
        "GET",
        undefined,
        second,
      )
    ).data.posts.length,
    0,
  );
  assert.equal(
    (
      await send("/api/login", "POST", {
        email: "x'OR'1'='1@security.example",
        password: payload,
        role: "admin",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await send(
        `/api/posts/${encodeURIComponent(payload)}`,
        "DELETE",
        undefined,
        admin,
      )
    ).status,
    404,
  );
  assert.equal(
    (await send(`/api/posts/${postId}`, "PATCH", { status: payload }, admin))
      .status,
    400,
  );
  assert.equal(db.prepare("SELECT count(*) n FROM users").get().n, 3);
  assert.equal(
    db.prepare("PRAGMA integrity_check").get().integrity_check,
    "ok",
  );
});
test("role changes during body streaming prevent stale administrator writes", async () => {
  const result = await send(
    `/api/posts/${postId}`,
    "PATCH",
    { status: "Returned" },
    admin,
    () => db.prepare("UPDATE users SET role='student' WHERE id=?").run(adminId),
  );
  assert.equal(result.status, 403);
  assert.equal(
    db.prepare("SELECT status FROM posts WHERE id=?").get(postId).status,
    "Found",
  );
  db.prepare("UPDATE users SET role='admin' WHERE id=?").run(adminId);
});
test("revocation during body streaming prevents student creation", async () => {
  const count = db.prepare("SELECT count(*) n FROM posts").get().n;
  const result = await send("/api/posts", "POST", details, student, () =>
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(studentId),
  );
  assert.equal(result.status, 401);
  assert.equal(db.prepare("SELECT count(*) n FROM posts").get().n, count);
});
