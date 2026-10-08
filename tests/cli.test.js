import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { scryptSync, timingSafeEqual } from "node:crypto";
import http from "node:http";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const originalPassword = "CliAdmin123!";
const changedPassword = "ChangedAdmin123!";
function environment(directory, extra = {}) {
  const env = { ...process.env };
  for (const name of ["ADMIN_EMAIL", "ADMIN_NAME", "ADMIN_PASSWORD"])
    delete env[name];
  return {
    ...env,
    NODE_ENV: "development",
    DATA_DIR: directory,
    HOST: "127.0.0.1",
    PORT: "0",
    OPEN_BROWSER: "false",
    ...extra,
  };
}
async function isolated(work) {
  const directory = await mkdtemp(path.join(tmpdir(), "retorno-cli-"));
  try {
    await work(directory);
  } finally {
    const resolved = path.resolve(directory);
    if (
      !resolved.startsWith(path.resolve(tmpdir()) + path.sep) ||
      !path.basename(resolved).startsWith("retorno-cli-")
    )
      throw new Error("Refusing cleanup outside the CLI test directory.");
    await rm(resolved, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 200,
    });
  }
}
function inspect(directory, work) {
  const db = new DatabaseSync(path.join(directory, "retorno.sqlite"));
  try {
    return work(db);
  } finally {
    db.close();
  }
}
function passwordMatches(password, stored) {
  const [salt, hash] = stored.split(":");
  return timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(hash, "hex"),
  );
}
function command(
  directory,
  script,
  { env = {}, answers = [], imports = [] } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [...imports, path.join(root, "scripts", script)],
      {
        cwd: root,
        env: environment(directory, env),
        windowsHide: true,
      },
    );
    let stdout = "",
      stderr = "",
      next = 0,
      cursor = 0,
      timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 10_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      // Answer only after each prompt appears; readline discards prematurely piped lines.
      while (next < answers.length) {
        const [prompt, answer] = answers[next];
        const index = stdout.indexOf(prompt, cursor);
        if (index < 0) break;
        cursor = index + prompt.length;
        next++;
        child.stdin.write(answer + "\n");
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut)
        reject(new Error(`CLI timeout: ${script}\n${stdout}\n${stderr}`));
      else resolve({ code, stdout, stderr });
    });
  });
}
const admin = (directory, email = "admin@cli.example", extra = {}) =>
  command(directory, "admin.js", {
    env: {
      ADMIN_EMAIL: email,
      ADMIN_NAME: "CLI Admin",
      ADMIN_PASSWORD: originalPassword,
      ...extra,
    },
  });
const reset = (directory, email, password, confirmation = password) =>
  command(directory, "admin-recovery.js", {
    answers: [
      ["Admin email to reset: ", email],
      ["New password (", password],
      ["Confirm new password: ", confirmation],
    ],
  });
async function running(directory, work) {
  const child = spawn(process.execPath, [path.join(root, "scripts/start.js")], {
    cwd: root,
    env: environment(directory),
    windowsHide: true,
  });
  const closed = new Promise((resolve) => child.once("close", resolve));
  let output = "",
    stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Server startup timeout: " + stderr)),
        10_000,
      );
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("close", () => {
        clearTimeout(timer);
        reject(new Error("Server exited before startup: " + stderr));
      });
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const match = /RETURNO running at http:\/\/localhost:(\d+)/.exec(
          output,
        );
        if (match) {
          clearTimeout(timer);
          resolve(`http://127.0.0.1:${match[1]}`);
        }
      });
    });
    await work(url);
  } finally {
    child.kill();
    await closed;
  }
}
async function request(url, route, method = "GET", data, cookie) {
  const response = await fetch(url + route, {
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
const login = (url, email, password = originalPassword, role = "admin") =>
  request(url, "/api/login", "POST", { email, password, role });

test("admin setup normalizes accounts, hashes passwords and refuses duplicates/invalid input", async () =>
  isolated(async (directory) => {
    assert.equal((await admin(directory, "  ADMIN@CLI.EXAMPLE  ")).code, 0);
    const before = inspect(directory, (db) =>
      db.prepare("SELECT * FROM users").all(),
    );
    assert.equal(before[0].email, "admin@cli.example");
    assert.equal(before[0].role, "admin");
    assert.ok(passwordMatches(originalPassword, before[0].password_hash));
    const duplicate = await admin(directory);
    assert.equal(duplicate.code, 1);
    assert.match(duplicate.stderr, /Email already exists/);
    for (const extra of [
      { ADMIN_EMAIL: "invalid" },
      { ADMIN_NAME: " " },
      { ADMIN_PASSWORD: "short" },
      { ADMIN_PASSWORD: "x".repeat(129) },
    ]) {
      const result = await admin(directory, "new@cli.example", extra);
      assert.equal(result.code, 1);
      assert.match(result.stderr, /Invalid account details/);
    }
    assert.deepEqual(
      inspect(directory, (db) => db.prepare("SELECT * FROM users").all()),
      before,
    );
  }));

test("interactive admin setup accepts prompt-by-prompt input", async () =>
  isolated(async (directory) => {
    const result = await command(directory, "admin.js", {
      answers: [
        ["Admin email: ", "interactive@cli.example"],
        ["Full name: ", "Interactive Admin"],
        ["Password (", originalPassword],
      ],
    });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Admin account created/);
    assert.equal(
      inspect(
        directory,
        (db) => db.prepare("SELECT full_name FROM users").get().full_name,
      ),
      "Interactive Admin",
    );
  }));

test("recovery rejects missing admins, unknown targets and invalid passwords without changes", async () =>
  isolated(async (directory) => {
    const empty = await command(directory, "admin-recovery.js");
    assert.equal(empty.code, 1);
    assert.match(empty.stderr, /No administrator accounts exist/);
    assert.equal((await admin(directory)).code, 0);
    const before = inspect(directory, (db) =>
      db.prepare("SELECT * FROM users").all(),
    );
    for (const [email, password, confirmation, message] of [
      [
        "unknown@cli.example",
        changedPassword,
        changedPassword,
        /not an administrator/,
      ],
      ["admin@cli.example", "short", "short", /8.*128 characters/],
      [
        "admin@cli.example",
        "x".repeat(129),
        "x".repeat(129),
        /8.*128 characters/,
      ],
      [
        "admin@cli.example",
        changedPassword,
        "Mismatch123!",
        /Passwords do not match/,
      ],
    ]) {
      const result = await reset(directory, email, password, confirmation);
      assert.equal(result.code, 1);
      assert.match(result.stderr, message);
    }
    assert.deepEqual(
      inspect(directory, (db) => db.prepare("SELECT * FROM users").all()),
      before,
    );
  }));

test("recovery rolls back failures, revokes only the chosen admin's sessions, and enables new login", async () =>
  isolated(async (directory) => {
    assert.equal((await admin(directory)).code, 0);
    assert.equal((await admin(directory, "other@cli.example")).code, 0);
    await running(directory, async (url) => {
      const first = await login(url, "admin@cli.example");
      const second = await login(url, "admin@cli.example");
      const other = await login(url, "other@cli.example");
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(other.status, 200);
      const before = inspect(directory, (db) => ({
        users: db.prepare("SELECT * FROM users ORDER BY email").all(),
        sessions: db
          .prepare("SELECT * FROM sessions ORDER BY token_hash")
          .all(),
      }));
      inspect(directory, (db) =>
        db.exec(
          "CREATE TRIGGER reject_reset BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT,'forced recovery failure'); END;",
        ),
      );
      const failed = await reset(
        directory,
        "admin@cli.example",
        changedPassword,
      );
      assert.equal(failed.code, 1);
      assert.match(failed.stderr, /forced recovery failure/);
      assert.deepEqual(
        inspect(directory, (db) => ({
          users: db.prepare("SELECT * FROM users ORDER BY email").all(),
          sessions: db
            .prepare("SELECT * FROM sessions ORDER BY token_hash")
            .all(),
        })),
        before,
      );
      inspect(directory, (db) => db.exec("DROP TRIGGER reject_reset"));
      const result = await reset(
        directory,
        " ADMIN@CLI.EXAMPLE ",
        changedPassword,
      );
      assert.equal(result.code, 0);
      assert.match(result.stdout, /Password reset for admin@cli.example/);
      for (const session of [first, second])
        assert.equal(
          (await request(url, "/api/me", "GET", undefined, session.cookie))
            .status,
          401,
        );
      assert.equal(
        (await request(url, "/api/me", "GET", undefined, other.cookie)).status,
        200,
      );
      assert.equal((await login(url, "admin@cli.example")).status, 401);
      assert.equal(
        (await login(url, "admin@cli.example", changedPassword)).status,
        200,
      );
    });
  }));

test("demo seeds fresh data and refuses to replace existing users/posts", async () =>
  isolated(async (directory) => {
    const seeded = await command(directory, "demo.js");
    assert.equal(seeded.code, 0);
    const snapshot = () =>
      inspect(directory, (db) => ({
        users: db.prepare("SELECT * FROM users ORDER BY email").all(),
        posts: db.prepare("SELECT * FROM posts ORDER BY id").all(),
      }));
    const before = snapshot();
    assert.equal(before.users.length, 8);
    assert.equal(before.posts.length, 9);
    assert.ok(
      passwordMatches(
        "RetornoDemo123!",
        before.users.find((user) => user.email === "admin@example.com")
          .password_hash,
      ),
    );
    assert.equal(
      inspect(
        directory,
        (db) => db.prepare("PRAGMA integrity_check").get().integrity_check,
      ),
      "ok",
    );
    const refused = await command(directory, "demo.js");
    assert.equal(refused.code, 1);
    assert.match(refused.stderr, /Existing records were not changed/);
    assert.deepEqual(snapshot(), before);
  }));

test("demo refuses a non-demo database without modifying its account", async () =>
  isolated(async (directory) => {
    assert.equal((await admin(directory)).code, 0);
    const before = inspect(directory, (db) =>
      db.prepare("SELECT * FROM users").all(),
    );
    assert.equal((await command(directory, "demo.js")).code, 1);
    assert.deepEqual(
      inspect(directory, (db) => db.prepare("SELECT * FROM users").all()),
      before,
    );
  }));

test("startup serves health and preserves accounts/posts after a process restart", async () =>
  isolated(async (directory) => {
    let postId;
    await running(directory, async (url) => {
      assert.equal((await request(url, "/api/health")).data.service, "retorno");
      const student = await request(url, "/api/register", "POST", {
        email: "restart@cli.example",
        fullName: "Restart Student",
        password: originalPassword,
        confirmPassword: originalPassword,
      });
      assert.equal(student.status, 201);
      const post = await request(
        url,
        "/api/posts",
        "POST",
        {
          kind: "Lost",
          item_name: "Restart wallet",
          event_at: "2026-10-06T12:30",
          location: "Gate",
          description: "Persistence across processes",
        },
        student.cookie,
      );
      assert.equal(post.status, 201);
      postId = post.data.post.id;
    });
    await running(directory, async (url) => {
      const student = await login(
        url,
        "restart@cli.example",
        originalPassword,
        "student",
      );
      assert.equal(student.status, 200);
      assert.ok(
        (
          await request(url, "/api/posts", "GET", undefined, student.cookie)
        ).data.posts.some((post) => post.id === postId),
      );
    });
  }));

test("startup fails clearly for occupied ports, unusable data paths and unsupported Node versions", async () =>
  isolated(async (directory) => {
    const occupied = http.createServer();
    await new Promise((resolve) => occupied.listen(0, "127.0.0.1", resolve));
    try {
      const result = await command(directory, "start.js", {
        env: { PORT: String(occupied.address().port) },
      });
      assert.equal(result.code, 1);
      assert.match(result.stderr, /port is already in use/);
    } finally {
      await new Promise((resolve) => occupied.close(resolve));
    }
    const blockedPath = path.join(directory, "not-a-directory");
    await writeFile(blockedPath, "Test file");
    const blocked = await command(directory, "start.js", {
      env: { DATA_DIR: blockedPath },
    });
    assert.equal(blocked.code, 1);
    assert.match(blocked.stderr, /RETURNO could not start/);
    // Exercise the version guard in a disposable subprocess; this is not a Node 22 compatibility run.
    const shim = path.join(directory, "node-version.mjs");
    await writeFile(
      shim,
      'Object.defineProperty(process.versions, "node", { value: "22.0.0" });',
    );
    const unsupported = await command(directory, "start.js", {
      imports: ["--import", pathToFileURL(shim).href],
    });
    assert.equal(unsupported.code, 1);
    assert.match(unsupported.stderr, /requires Node.js 24 or newer/);
  }));
