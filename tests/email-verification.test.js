import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setMailTransport } from "../mail.js";
let server, db, base, directory;
const codes = new Map();
const mock = {
  async sendMail(message) {
    codes.set(message.to, message.text.match(/code is (\d{6})/)[1]);
    return {};
  },
};
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "retorno-verification-"));
  process.env.DATA_DIR = directory;
  process.env.NODE_ENV = "test";
  ({ server } = await import("../server.js"));
  ({ db } = await import("../db.js"));
  setMailTransport(mock);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  await rm(directory, { recursive: true, force: true });
});
async function request(route, data) {
  const res = await fetch(base + "/api/" + route, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  return {
    status: res.status,
    data: await res.json(),
    cookie: res.headers.get("set-cookie"),
  };
}
const account = (email) => ({
  email,
  fullName: "Verification Student",
  password: "VerifyStudent123!",
  confirmPassword: "VerifyStudent123!",
  role: "admin",
});
const verify = (email, code = codes.get(email)) =>
  request("verify-email", { email, code });
test("pending signup has no account/session; only a valid single-use code creates a student", async () => {
  const email = "ownership@gmail.com";
  const result = await request("register", account(email));
  assert.equal(result.status, 202);
  assert.equal(result.cookie, null);
  assert.equal(
    db.prepare("SELECT * FROM users WHERE email=?").get(email),
    undefined,
  );
  const pending = db
    .prepare("SELECT * FROM pending_registrations WHERE email=?")
    .get(email);
  assert.notEqual(pending.code_hash, codes.get(email));
  assert.notEqual(pending.password_hash, account(email).password);
  assert.equal(JSON.stringify(result.data).includes(codes.get(email)), false);
  assert.equal(
    (await request("login", { ...account(email), role: "student" })).status,
    401,
  );
  assert.equal((await verify(email, "000000")).status, 400);
  const confirmed = await verify(email);
  assert.equal(confirmed.status, 201);
  assert.equal(confirmed.data.user.role, "student");
  assert.match(confirmed.cookie, /HttpOnly/);
  assert.equal((await verify(email)).status, 400);
  assert.equal(
    (await request("login", { ...account(email), role: "student" })).status,
    200,
  );
});
test("expiry, five-attempt lockout and resend cooldown are enforced", async () => {
  const email = "expiry@gmail.com";
  await request("register", account(email));
  assert.equal((await request("register", account(email))).status, 429);
  db.prepare("UPDATE pending_registrations SET expires_at=0 WHERE email=?").run(
    email,
  );
  assert.equal((await verify(email)).status, 400);
  db.prepare("UPDATE pending_registrations SET sent_at=0 WHERE email=?").run(
    email,
  );
  assert.equal((await request("register", account(email))).status, 202);
  for (let i = 0; i < 5; i++)
    assert.equal((await verify(email, "000000")).status, 400);
  assert.equal((await verify(email)).status, 400);
  assert.equal(
    db.prepare("SELECT * FROM users WHERE email=?").get(email),
    undefined,
  );
});
test("failed email delivery creates neither pending registration nor account", async () => {
  setMailTransport({
    async sendMail() {
      throw Error("SMTP unavailable");
    },
  });
  try {
    assert.equal(
      (await request("register", account("failure@gmail.com"))).status,
      503,
    );
    assert.equal(
      db
        .prepare("SELECT * FROM pending_registrations WHERE email=?")
        .get("failure@gmail.com"),
      undefined,
    );
    assert.equal(
      db.prepare("SELECT * FROM users WHERE email=?").get("failure@gmail.com"),
      undefined,
    );
  } finally {
    setMailTransport(mock);
  }
});
test("session failure rolls back verification and retains the pending code for retry", async () => {
  const email = "retry@gmail.com";
  await request("register", account(email));
  db.exec(
    "CREATE TRIGGER verification_session_failure BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'verification test'); END;",
  );
  try {
    assert.equal((await verify(email)).status, 500);
    assert.equal(
      db.prepare("SELECT * FROM users WHERE email=?").get(email),
      undefined,
    );
  } finally {
    db.exec("DROP TRIGGER verification_session_failure");
  }
  assert.equal((await verify(email)).status, 201);
});

test("resending invalidates the previous code and concurrent requests send only one email", async () => {
  const email = "resend@gmail.com";
  await request("register", account(email));
  const old = codes.get(email);
  db.prepare("UPDATE pending_registrations SET sent_at=0 WHERE email=?").run(
    email,
  );
  await request("register", account(email));
  // A rare repeated random value is still valid; force a distinct old value for invalidation assertion.
  if (old !== codes.get(email))
    assert.equal((await verify(email, old)).status, 400);
  assert.equal((await verify(email)).status, 201);
  let release, delivered;
  const sending = new Promise((resolve) => {
    delivered = resolve;
  });
  setMailTransport({
    async sendMail(message) {
      delivered();
      await new Promise((resolve) => {
        release = resolve;
      });
      return {};
    },
  });
  try {
    const first = request("register", account("concurrent@gmail.com"));
    await sending;
    assert.equal(
      (await request("register", account("concurrent@gmail.com"))).status,
      429,
    );
    release();
    assert.equal((await first).status, 202);
  } finally {
    release?.();
    setMailTransport(mock);
  }
});
