import { setMailTransport } from "../mail.js";
const codes = new Map();
setMailTransport({
  async sendMail(message) {
    codes.set(message.to, message.text.match(/code is (\d{6})/)[1]);
    return {};
  },
});
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
let server, db, createUser, base, directory;
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "retorno-test-"));
  process.env.DATA_DIR = directory;
  process.env.NODE_ENV = "test";
  ({ server } = await import("../server.js"));
  ({ db, createUser } = await import("../db.js"));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  await rm(directory, { recursive: true, force: true });
});
async function request(route, method = "GET", body, cookie, extra = {}) {
  const res = await fetch(base + route, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (route === "/api/register" && res.status === 202) {
    await res.json();
    return request("/api/verify-email", "POST", {
      email: body.email,
      code: codes.get(body.email),
    });
  }
  return {
    status: res.status,
    data: await res.json(),
    cookie: res.headers.get("set-cookie")?.split(";")[0],
  };
}
test("registration, authentication, roles, post lifecycle, search and persistence", async () => {
  assert.equal((await request("/api/posts")).status, 401);
  const student = await request("/api/register", "POST", {
    email: "student@test.example",
    fullName: "Student",
    password: "Student123!",
    confirmPassword: "Student123!",
    role: "admin",
  });
  assert.equal(student.status, 201);
  assert.equal(student.data.user.role, "student");
  assert.equal(
    (await request("/api/me", "GET", undefined, student.cookie)).data.user
      .email,
    "student@test.example",
  );
  assert.equal(
    (await request("/api/stats", "GET", undefined, student.cookie)).status,
    403,
  );
  assert.equal(
    (
      await request("/api/register", "POST", {
        email: "student@test.example",
        fullName: "Student",
        password: "Student123!",
        confirmPassword: "Student123!",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/api/login", "POST", {
        email: "student@test.example",
        password: "Wrongpass!",
        role: "student",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("/api/login", "POST", {
        email: "student@test.example",
        password: "Student123!",
        role: "admin",
      })
    ).status,
    401,
  );
  const second = await request("/api/register", "POST", {
    email: "second@test.example",
    fullName: "Other",
    password: "Student123!",
    confirmPassword: "Student123!",
  });
  const details = {
    kind: "Found",
    item_name: "Wallet",
    event_at: "2026-10-06T12:30",
    location: "Library",
    description: "Brown wallet",
    image:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jSxoAAAAASUVORK5CYII=",
  };
  const created = await request("/api/posts", "POST", details, student.cookie);
  assert.equal(created.status, 201);
  const id = created.data.post.id;
  assert.equal(created.data.post.author, "Student");
  assert.equal(created.data.post.status, "Found");
  assert.equal(
    (await request("/api/posts?mine=1", "GET", undefined, second.cookie)).data
      .posts.length,
    0,
  );
  assert.equal(
    (
      await request(
        "/api/posts?q=wallet&kind=Found",
        "GET",
        undefined,
        second.cookie,
      )
    ).data.posts.length,
    1,
  );
  assert.equal(
    (await request("/api/posts?q=phone", "GET", undefined, second.cookie)).data
      .posts.length,
    0,
  );
  assert.equal(
    (await request("/api/posts/" + id, "DELETE", undefined, second.cookie))
      .status,
    403,
  );
  assert.equal(
    (await request("/api/posts/" + id, "PUT", details, second.cookie)).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/posts/" + id,
        "PATCH",
        { status: "Claimed" },
        second.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (await request("/api/posts/" + id, "GET", undefined, student.cookie))
      .status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/posts/" + id,
        "PUT",
        { ...details, item_name: "Black wallet" },
        student.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/posts/" + id,
        "PATCH",
        { status: "Claimed" },
        student.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (await request("/api/posts/" + id, "DELETE", undefined, student.cookie))
      .status,
    403,
  );
  assert.equal(
    (await request("/api/posts?mine=1", "GET", undefined, student.cookie)).data
      .posts[0].item_name,
    "Wallet",
  );
  createUser("admin@test.example", "Admin", "Administrator123!", "admin");
  const admin = await request("/api/login", "POST", {
    email: "admin@test.example",
    password: "Administrator123!",
    role: "admin",
  });
  assert.equal(admin.status, 200);
  assert.equal(
    (await request("/api/posts/" + id, "GET", undefined, admin.cookie)).status,
    200,
  );
  assert.equal(
    (
      await request(
        "/api/posts/" + id,
        "PUT",
        { ...details, item_name: "Black wallet" },
        admin.cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        "/api/posts/" + id,
        "PATCH",
        { status: "Claimed" },
        admin.cookie,
      )
    ).data.post.status,
    "Claimed",
  );
  assert.equal(
    (await request("/api/stats", "GET", undefined, admin.cookie)).data.stats
      .Claimed,
    1,
  );
  assert.equal(
    (
      await request(
        "/api/posts/" + id,
        "PATCH",
        { status: "Returned" },
        admin.cookie,
      )
    ).status,
    200,
  );
  const persistent = new DatabaseSync(path.join(directory, "retorno.sqlite"));
  assert.equal(
    persistent.prepare("SELECT status FROM posts WHERE id=?").get(id).status,
    "Returned",
  );
  persistent.close();
  assert.equal(
    (await request("/api/posts/" + id, "DELETE", undefined, admin.cookie))
      .status,
    200,
  );
  assert.equal(
    (await request("/api/posts/" + id, "GET", undefined, admin.cookie)).status,
    404,
  );
  assert.equal(
    (await request("/api/logout", "POST", {}, student.cookie)).status,
    200,
  );
  assert.equal(
    (await request("/api/me", "GET", undefined, student.cookie)).status,
    401,
  );
});
test("validation, cross-origin protection and static serving", async () => {
  const login = await request("/api/login", "POST", {
    email: "second@test.example",
    password: "Student123!",
    role: "student",
  });
  const input = {
    kind: "Lost",
    item_name: "Key",
    event_at: "2026-10-06T11:00",
    location: "Gate",
    description: "Keys",
  };
  assert.equal(
    (
      await request("/api/posts", "POST", input, login.cookie, {
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/posts",
        "POST",
        { ...input, kind: "other" },
        login.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/api/posts",
        "POST",
        { ...input, event_at: "not-a-date" },
        login.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/api/posts",
        "POST",
        { ...input, image: "data:image/svg+xml;base64,PHN2Zz4=" },
        login.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/api/posts",
        "POST",
        { ...input, image: "data:image/png;base64,dGVzdA==" },
        login.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/api/posts",
        "POST",
        { ...input, item_name: "" },
        login.cookie,
      )
    ).status,
    400,
  );
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /app.js/);
  const logo = await fetch(base + "/assets/logo.png");
  assert.equal(logo.status, 200);
  assert.equal(logo.headers.get("content-type"), "image/png");
  assert.equal((await fetch(base + "/schema.sql")).status, 404);
  assert.equal((await fetch(base + "/db.js")).status, 404);
});

test("new account remains usable through a fresh login and feed request", async () => {
  const health = await request("/api/health");
  assert.equal(health.data.service, "retorno");
  const account = {
    email: "new.account@test.example",
    fullName: "New Account",
    password: "NewAccount123!",
    confirmPassword: "NewAccount123!",
  };
  const registration = await request("/api/register", "POST", account);
  assert.equal(registration.status, 201);
  assert.equal(
    (await request("/api/posts", "GET", undefined, registration.cookie)).status,
    200,
  );
  await request("/api/logout", "POST", {}, registration.cookie);
  const login = await request("/api/login", "POST", {
    email: account.email,
    password: account.password,
    role: "student",
  });
  assert.equal(login.status, 200);
  assert.equal(
    (await request("/api/me", "GET", undefined, login.cookie)).data.user
      .fullName,
    "New Account",
  );
  const row = db
    .prepare("SELECT password_hash FROM users WHERE email=?")
    .get(account.email);
  assert.notEqual(row.password_hash, account.password);
});
test("registration rolls back the account if session creation fails", async () => {
  db.exec(
    "CREATE TRIGGER test_session_failure BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'test session failure'); END;",
  );
  try {
    const response = await request("/api/register", "POST", {
      email: "rollback@test.example",
      fullName: "Rollback",
      password: "Rollback123!",
      confirmPassword: "Rollback123!",
    });
    assert.equal(response.status, 500);
    assert.equal(
      db
        .prepare("SELECT id FROM users WHERE email=?")
        .get("rollback@test.example"),
      undefined,
    );
  } finally {
    db.exec("DROP TRIGGER test_session_failure");
  }
});
test("active status and report type stay consistent after status changes", async () => {
  const login = await request("/api/login", "POST", {
    email: "second@test.example",
    password: "Student123!",
    role: "student",
  });
  const fields = {
    kind: "Found",
    item_name: "Key",
    event_at: "2026-10-06T12:30",
    location: "Library",
    description: "Keys",
  };
  const post = await request("/api/posts", "POST", fields, login.cookie);
  const admin = await request("/api/login", "POST", {
    email: "admin@test.example",
    password: "Administrator123!",
    role: "admin",
  });
  const update = await request(
    "/api/posts/" + post.data.post.id,
    "PATCH",
    { status: "Lost" },
    admin.cookie,
  );
  assert.equal(update.data.post.kind, "Lost");
  assert.equal(update.data.post.status, "Lost");
  assert.equal(
    (
      await request(
        "/api/posts/" + post.data.post.id,
        "PUT",
        { ...fields, status: "Lost" },
        admin.cookie,
      )
    ).status,
    400,
  );
});
test("schema integrity, uniqueness, foreign keys and role constraints", async () => {
  assert.equal(
    db.prepare("PRAGMA integrity_check").get().integrity_check,
    "ok",
  );
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
  assert.throws(() =>
    db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run("invalid-test-session", "missing-user", Date.now() + 1000),
  );
  assert.throws(() =>
    db
      .prepare(
        "UPDATE users SET role='owner' WHERE email='second@test.example'",
      )
      .run(),
  );
  assert.throws(() =>
    db
      .prepare(
        "UPDATE users SET email='student@test.example' WHERE email='second@test.example'",
      )
      .run(),
  );
  assert.throws(() => db.prepare("UPDATE posts SET status='Invalid'").run());
});

test("image upload accepts 10 MB and rejects one byte above the limit", async () => {
  createUser("upload-limit@test.example","Upload test","Upload123!","student");
  const login=await request("/api/login","POST",{email:"upload-limit@test.example",password:"Upload123!",role:"student"});
  const bytes=Buffer.alloc(10*1024*1024);
  Buffer.from("89504e470d0a1a0a","hex").copy(bytes);
  const input={kind:"Found",item_name:"Upload boundary",event_at:"2026-10-09T12:00",location:"Test",description:"Isolated boundary fixture"};
  const accepted=await request("/api/posts","POST",{...input,image:"data:image/png;base64,"+bytes.toString("base64")},login.cookie);
  assert.equal(accepted.status,201);
  const rejected=await request("/api/posts","POST",{...input,image:"data:image/png;base64,"+Buffer.concat([bytes,Buffer.alloc(1)]).toString("base64")},login.cookie);
  assert.equal(rejected.status,413);
});

test("post contacts validate, persist, and retain admin-only editing", async () => {
 createUser("contacts@test.example","Contact test","Contact123!");
 const login=await request("/api/login","POST",{email:"contacts@test.example",password:"Contact123!",role:"student"});
 const input={kind:"Lost",item_name:"Contact fixture",event_at:"2026-10-09T12:00",location:"Test",description:"Test",contact_email:"Contact.Test@gmail.com",contact_phone:"+63 912 345 6789"};
 const created=await request("/api/posts","POST",input,login.cookie);assert.equal(created.status,201);
 assert.equal(created.data.post.contact_email,"contact.test@gmail.com");assert.equal(created.data.post.contact_phone,input.contact_phone);
 for(const invalid of [{contact_email:"bad@example.com"},{contact_phone:"<script>"},{contact_phone:"123"},{contact_email:123}]) assert.equal((await request("/api/posts","POST",{...input,...invalid},login.cookie)).status,400);
 const id=created.data.post.id;assert.equal((await request("/api/posts/"+id,"PUT",input,login.cookie)).status,403);
 const admin=await request("/api/login","POST",{email:"admin@test.example",password:"Administrator123!",role:"admin"});
 const {contact_email,contact_phone,...withoutContacts}=input;
 const updated=await request("/api/posts/"+id,"PUT",withoutContacts,admin.cookie);assert.equal(updated.status,200);assert.equal(updated.data.post.contact_email,"contact.test@gmail.com");
 const cleared=await request("/api/posts/"+id,"PUT",{...input,contact_email:"",contact_phone:""},admin.cookie);assert.equal(cleared.status,200);assert.equal(cleared.data.post.contact_phone,"");
});
