// Exercise real HTTP handlers without binding a network port.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
let server, db, createUser, handler, directory, adminCookie, studentCookie;
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "retorno-routes-"));
  process.env.DATA_DIR = directory;
  process.env.NODE_ENV = "test";
  ({ server } = await import("../server.js"));
  ({ db, createUser } = await import("../db.js"));
  handler = server.listeners("request")[0];
  createUser("admin@example.test", "First Admin", "FirstAdmin123!", "admin");
  createUser(
    "student@example.test",
    "Test Student",
    "StudentTest123!",
    "student",
  );
  adminCookie = (
    await send("/api/login", "POST", {
      email: "admin@example.test",
      password: "FirstAdmin123!",
      role: "admin",
    })
  ).cookie;
  studentCookie = (
    await send("/api/login", "POST", {
      email: "student@example.test",
      password: "StudentTest123!",
      role: "student",
    })
  ).cookie;
});
after(async () => {
  db.close();
  await rm(directory, { recursive: true, force: true });
});
async function send(url, method = "GET", data, cookie) {
  const input = data === undefined ? [] : [Buffer.from(JSON.stringify(data))];
  const req = Readable.from(input);
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
  let status = 0,
    headers = {},
    payload = "";
  const response = {
    headersSent: false,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    writeHead(code, fields = {}) {
      status = code;
      Object.assign(
        headers,
        Object.fromEntries(
          Object.entries(fields).map(([k, v]) => [k.toLowerCase(), v]),
        ),
      );
      this.headersSent = true;
    },
    end(value) {
      if (value !== undefined) payload = String(value);
    },
  };
  await handler(req, response);
  return {
    status,
    headers,
    data: payload ? JSON.parse(payload) : null,
    cookie: headers["set-cookie"]?.split(";")[0],
  };
}
test("only an existing admin can create additional administrators", async () => {
  assert.equal(
    (
      await send(
        "/api/admins",
        "POST",
        {
          email: "blocked@example.test",
          fullName: "Blocked",
          password: "Blocked123!",
          confirmPassword: "Blocked123!",
        },
        studentCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await send("/api/admins", "POST", {
        email: "blocked@example.test",
        fullName: "Blocked",
        password: "Blocked123!",
        confirmPassword: "Blocked123!",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await send(
        "/api/admins",
        "POST",
        {
          email: "blocked@example.test",
          fullName: "Blocked",
          password: "Blocked123!",
          confirmPassword: "Mismatch123!",
        },
        adminCookie,
      )
    ).status,
    400,
  );
  const added = await send(
    "/api/admins",
    "POST",
    {
      email: "second.admin@example.test",
      fullName: "Second Admin",
      password: "SecondAdmin123!",
      confirmPassword: "SecondAdmin123!",
    },
    adminCookie,
  );
  assert.equal(added.status, 201);
  assert.equal(added.data.user.role, "admin");
  assert.equal(
    (
      await send(
        "/api/posts",
        "POST",
        {
          kind: "Lost",
          item_name: "Forbidden",
          event_at: "2026-10-06T12:30",
          location: "Gate",
          description: "test",
        },
        adminCookie,
      )
    ).status,
    403,
  );
  const login = await send("/api/login", "POST", {
    email: "second.admin@example.test",
    password: "SecondAdmin123!",
    role: "admin",
  });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.role, "admin");
  assert.equal(
    (
      await send(
        "/api/admins",
        "POST",
        {
          email: "second.admin@example.test",
          fullName: "Duplicate",
          password: "Duplicate123!",
          confirmPassword: "Duplicate123!",
        },
        adminCookie,
      )
    ).status,
    409,
  );
});
test("only admins can view registered users and password hashes are never returned", async () => {
  const adminResult = await send("/api/users", "GET", undefined, adminCookie);
  assert.equal(adminResult.status, 200);
  assert.ok(
    adminResult.data.users.some(
      (user) => user.email === "admin@example.test" && user.role === "admin",
    ),
  );
  assert.ok(
    adminResult.data.users.some(
      (user) =>
        user.email === "student@example.test" && user.role === "student",
    ),
  );
  for (const user of adminResult.data.users)
    assert.deepEqual(
      Object.keys(user).sort(),
      ["created_at", "email", "full_name", "id", "role"].sort(),
    );
  assert.equal(
    (await send("/api/users", "GET", undefined, studentCookie)).status,
    403,
  );
  assert.equal((await send("/api/users", "GET")).status, 401);
});
test("public registration remains student-only, whatever role the browser sends", async () => {
  const result = await send("/api/register", "POST", {
    email: "forged@example.test",
    fullName: "Forged Role",
    password: "Forged123!",
    confirmPassword: "Forged123!",
    role: "admin",
  });
  assert.equal(result.status, 201);
  assert.equal(result.data.user.role, "student");
});
test("search matches any post content and still respects post filters", async () => {
  const made = await send(
    "/api/posts",
    "POST",
    {
      kind: "Found",
      item_name: "Coin purse",
      event_at: "2026-10-06T12:30",
      location: "North Library",
      description: "Blue embroidered keepsake",
      image: null,
    },
    studentCookie,
  );
  assert.equal(made.status, 201);
  for (const term of [
    "embroidered",
    "North Library",
    "2026-10-06",
    "Found",
    "Student",
  ]) {
    const matches = await send(
      "/api/posts?q=" + encodeURIComponent(term),
      "GET",
      undefined,
      studentCookie,
    );
    assert.ok(
      matches.data.posts.some((post) => post.id === made.data.post.id),
      `search field ${term}`,
    );
  }
  assert.equal(
    (
      await send(
        "/api/posts?q=embroidered&kind=Lost",
        "GET",
        undefined,
        studentCookie,
      )
    ).data.posts.length,
    0,
  );
});
