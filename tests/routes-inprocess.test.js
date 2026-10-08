import { setMailTransport } from "../mail.js";
let verificationCode;
setMailTransport({
  async sendMail(message) {
    verificationCode = message.text.match(/code is (\d{6})/)[1];
    return {};
  },
});
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
test("expired database sessions reject protected requests for both roles", async () => {
  for (const role of ["student", "admin"]) {
    const email = `expired-${role}@example.test`;
    const id = createUser(email, "Expired user", "ExpiredUser123!", role);
    const login = await send("/api/login", "POST", {
      email,
      password: "ExpiredUser123!",
      role,
    });
    db.prepare("UPDATE sessions SET expires_at=? WHERE user_id=?").run(
      Date.now() - 1,
      id,
    );
    for (const [url, method] of [
      ["/api/me", "GET"],
      ["/api/posts", "GET"],
      ["/api/posts", "POST"],
      ["/api/stats", "GET"],
      ["/api/admins", "POST"],
    ]) {
      assert.equal(
        (await send(url, method, undefined, login.cookie)).status,
        401,
      );
    }
  }
});

test("logout revokes each role's session and clears its cookie", async () => {
  for (const role of ["student", "admin"]) {
    const login = await send("/api/login", "POST", {
      email: `${role}@example.test`,
      password: role === "admin" ? "FirstAdmin123!" : "StudentTest123!",
      role,
    });
    assert.equal(login.status, 200);
    const logout = await send("/api/logout", "POST", undefined, login.cookie);
    assert.equal(logout.status, 200);
    assert.match(logout.headers["set-cookie"], /Max-Age=0/);
    assert.equal(
      (await send("/api/me", "GET", undefined, login.cookie)).status,
      401,
    );
    assert.equal(
      (await send("/api/posts", "GET", undefined, login.cookie)).status,
      401,
    );
    // Other active sessions remain usable.
    assert.equal(
      (
        await send(
          "/api/me",
          "GET",
          undefined,
          role === "admin" ? adminCookie : studentCookie,
        )
      ).status,
      200,
    );
  }
});

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
  assert.equal(result.status, 202);
  assert.equal(result.cookie, undefined);
  const confirmed = await send("/api/verify-email", "POST", {
    email: "forged@example.test",
    code: verificationCode,
  });
  assert.equal(confirmed.status, 201);
  assert.equal(confirmed.data.user.role, "student");
});
test("post creation and editing reject impossible dates without changing saved data", async () => {
  const input = {
    kind: "Lost",
    item_name: "Date validation item",
    event_at: "2024-02-29T23:59",
    location: "Library",
    description: "Calendar test",
  };
  const made = await send("/api/posts", "POST", input, studentCookie);
  assert.equal(made.status, 201);
  const id = made.data.post.id;
  for (const event_at of [
    "2026-02-30T12:00",
    "2026-02-29T12:00",
    "1900-02-29T12:00",
    "2100-02-29T12:00",
    "2026-04-31T12:00",
    "2026-06-31T12:00",
    "2026-09-31T12:00",
    "2026-11-31T12:00",
    "2026-01-00T12:00",
    "2026-00-01T12:00",
    "2026-13-01T12:00",
    "0000-01-01T12:00",
    "2026-01-01T24:00",
    "2026-01-01T12:60",
    "2026-01-01T-1:00",
    "2026-01-01T12:00:00",
    "2026-01-01T12:00Z",
    "2026-01-01T12:00+08:00",
    "2026-1-1T12:00",
    "10000-01-01T12:00",
  ]) {
    for (const [route, method, cookie] of [
      ["/api/posts", "POST", studentCookie],
      [`/api/posts/${id}`, "PUT", adminCookie],
    ]) {
      const result = await send(route, method, { ...input, event_at }, cookie);
      assert.equal(result.status, 400, `${method} rejects ${event_at}`);
      assert.equal(result.data.error, "Enter a valid date and time.");
    }
    assert.equal(
      db.prepare("SELECT event_at FROM posts WHERE id=?").get(id).event_at,
      input.event_at,
    );
  }
});

test("valid calendar boundaries retain campus wall time regardless of server timezone", async () => {
  const previousTZ = process.env.TZ;
  try {
    for (const tz of ["UTC", "America/New_York", "Asia/Manila"]) {
      process.env.TZ = tz;
      for (const event_at of [
        "0001-01-01T00:00",
        "0099-12-31T23:59",
        "2000-02-29T00:00",
        "2024-02-29T12:30",
        "2026-04-30T12:00",
        "2026-03-08T02:30",
        "9999-12-31T23:59",
      ]) {
        const input = {
          kind: "Found",
          item_name: "Valid date",
          event_at,
          location: "Gate",
          description: "Campus wall time",
        };
        const made = await send("/api/posts", "POST", input, studentCookie);
        assert.equal(made.status, 201, `${tz}: ${event_at}`);
        assert.equal(made.data.post.event_at, event_at);
        const edited = await send(
          `/api/posts/${made.data.post.id}`,
          "PUT",
          input,
          adminCookie,
        );
        assert.equal(edited.status, 200);
        assert.equal(edited.data.post.event_at, event_at);
      }
    }
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
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
