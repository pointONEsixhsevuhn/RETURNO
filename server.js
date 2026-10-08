import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { db, root, createUser, verifyPassword } from "./db.js";
import {
  authorize,
  requestPermission,
  postReadScope,
  adminRowScope,
  studentRowScope,
} from "./access-control.js";

const statuses = ["Lost", "Found", "Claimed", "Returned"];
const sessionAge = 7 * 24 * 60 * 60 * 1000;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  fullName: u.full_name,
  role: u.role,
});
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const queryPosts = `SELECT p.id,p.user_id,p.kind,p.status,p.item_name,p.event_at,p.location,p.description,p.image,p.created_at,p.updated_at,u.full_name AS author FROM posts p JOIN users u ON u.id=p.user_id`;
const attempts = new Map();

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}
async function body(req) {
  if (!(req.headers["content-type"] || "").startsWith("application/json"))
    fail(415, "Use JSON.");
  let size = 0,
    parts = [];
  for await (const part of req) {
    size += part.length;
    if (size > 4 * 1024 * 1024) fail(413, "Image must be smaller than 2 MB.");
    parts.push(part);
  }
  try {
    const data = JSON.parse(Buffer.concat(parts).toString());
    if (!data || typeof data !== "object" || Array.isArray(data)) throw Error();
    return data;
  } catch {
    fail(400, "Invalid request.");
  }
}
function textField(data, name, max = 200, optional = false) {
  const value = data[name];
  if (
    typeof value !== "string" ||
    (!optional && !value.trim()) ||
    value.length > max
  )
    fail(400, `Invalid ${name}.`);
  return value.trim();
}
function credentials(data) {
  const email = textField(data, "email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fail(400, "Enter a valid email.");
  if (
    typeof data.password !== "string" ||
    data.password.length < 8 ||
    data.password.length > 128
  )
    fail(400, "Password must contain 8–128 characters.");
  return { email, password: data.password };
}
function auth(req) {
  const token = (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("retorno_session="))
    ?.slice(16);
  if (!token) fail(401, "Please log in.");
  const user = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`,
    )
    .get(hash(token), Date.now());
  if (!user) fail(401, "Please log in.");
  return user;
}
function cookie(res, token, maxAge = sessionAge / 1000) {
  res.setHeader(
    "Set-Cookie",
    `retorno_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.COOKIE_SECURE === "true" ? "; Secure" : ""}`,
  );
}
async function authorizedBody(req, permission, expectedId) {
  const data = await body(req);
  // Body streaming yields: a session may be revoked or a role changed meanwhile.
  const currentUser = auth(req);
  if (currentUser.id !== expectedId) fail(401, "Please log in again.");
  authorize(currentUser, permission);
  return data;
}
function createSession(user) {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
    hash(token),
    user.id,
    Date.now() + sessionAge,
  );
  return token;
}
function login(res, user) {
  cookie(res, createSession(user));
  json(res, 200, { user: publicUser(user) });
}
function imageData(value) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") fail(400, "Invalid image.");
  const match =
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) fail(400, "Use a PNG, JPEG, or WebP image.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 2 * 1024 * 1024)
    fail(413, "Image must be smaller than 2 MB.");
  const valid =
    match[1] === "png"
      ? bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
      : match[1] === "jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WEBP";
  if (!valid) fail(400, "Invalid image content.");
  return value;
}
function validEventTime(value) {
  // Campus wall time, independent of the server's timezone or Date.parse normalization.
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59)
    return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}
function postData(data, previous) {
  const kind = data.kind;
  if (!["Lost", "Found"].includes(kind)) fail(400, "Select Lost or Found.");
  const status = previous ? (data.status ?? previous.status) : kind;
  if (!statuses.includes(status)) fail(400, "Invalid status.");
  if (["Lost", "Found"].includes(status) && status !== kind)
    fail(400, "Active status must match Lost / Found type.");
  const eventAt = textField(data, "event_at", 32);
  if (!validEventTime(eventAt)) fail(400, "Enter a valid date and time.");
  return [
    kind,
    status,
    textField(data, "item_name"),
    eventAt,
    textField(data, "location", 500),
    textField(data, "description", 3000),
    data.image === undefined
      ? (previous?.image ?? null)
      : imageData(data.image),
  ];
}
function rateLimit(req) {
  const key = req.socket.remoteAddress;
  const now = Date.now();
  for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k);
  const entry = attempts.get(key) || { count: 0, reset: now + 15 * 60 * 1000 };
  if (++entry.count > 40) fail(429, "Too many attempts. Try again later.");
  attempts.set(key, entry);
}

export const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
  try {
    const url = new URL(req.url, "http://localhost");
    const route = url.pathname;
    if (route.startsWith("/api/")) {
      if (!["GET", "HEAD"].includes(req.method)) {
        const origin = req.headers.origin;
        if (
          origin &&
          (!["http:", "https:"].includes(new URL(origin).protocol) ||
            new URL(origin).host !== req.headers.host)
        )
          fail(403, "Invalid origin.");
        if (req.headers["sec-fetch-site"] === "cross-site")
          fail(403, "Invalid origin.");
      }
      if (route === "/api/health" && req.method === "GET") {
        db.prepare("SELECT 1").get();
        return json(res, 200, { service: "retorno", version: "1.3.0" });
      }
      if (route === "/api/register" && req.method === "POST") {
        rateLimit(req);
        const data = await body(req),
          { email, password } = credentials(data);
        const fullName = textField(data, "fullName", 100);
        if (data.confirmPassword !== password)
          fail(400, "Passwords do not match.");
        if (db.prepare("SELECT id FROM users WHERE email=?").get(email))
          fail(409, "Email is already registered.");
        // Account and session succeed together; a failed session cannot leave a half-completed signup.
        let user, token;
        db.exec("BEGIN IMMEDIATE");
        try {
          const id = createUser(email, fullName, password); // Public registration never grants administrator rights.
          user = db.prepare("SELECT * FROM users WHERE id=?").get(id);
          token = createSession(user);
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        cookie(res, token);
        return json(res, 201, { user: publicUser(user) });
      }
      if (route === "/api/login" && req.method === "POST") {
        rateLimit(req);
        const data = await body(req),
          { email, password } = credentials(data);
        const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
        if (
          !user ||
          !verifyPassword(password, user.password_hash) ||
          user.role !== data.role
        )
          fail(401, "Incorrect email, password, or role.");
        return login(res, user);
      }
      const user = auth(req);
      authorize(user, requestPermission(route, req.method));
      if (route === "/api/admins" && req.method === "POST") {
        if (user.role !== "admin")
          fail(403, "Only administrators can register another admin.");
        const data = await authorizedBody(req, "admins.create", user.id),
          { email, password } = credentials(data),
          fullName = textField(data, "fullName", 100);
        if (data.confirmPassword !== password)
          fail(400, "Passwords do not match.");
        if (db.prepare("SELECT id FROM users WHERE email=?").get(email))
          fail(409, "Email is already registered.");
        const id = createUser(email, fullName, password, "admin");
        return json(res, 201, {
          user: publicUser(
            db.prepare("SELECT * FROM users WHERE id=?").get(id),
          ),
        });
      }
      if (route === "/api/me" && req.method === "GET")
        return json(res, 200, { user: publicUser(user) });
      if (route === "/api/logout" && req.method === "POST") {
        const token = (req.headers.cookie || "").match(
          /(?:^|;\s*)retorno_session=([^;]+)/,
        )?.[1];
        if (token)
          db.prepare(
            "DELETE FROM sessions WHERE token_hash=? AND user_id=?",
          ).run(hash(token), user.id);
        cookie(res, "", 0);
        return json(res, 200, { ok: true });
      }
      if (route === "/api/stats" && req.method === "GET") {
        if (user.role !== "admin") fail(403, "Administrator access required.");
        const stats = Object.fromEntries(statuses.map((s) => [s, 0]));
        for (const row of db
          .prepare(
            `SELECT status,COUNT(*) AS count FROM posts WHERE ${adminRowScope} GROUP BY status`,
          )
          .all(user.id))
          stats[row.status] = row.count;
        return json(res, 200, { stats });
      }
      if (route === "/api/users" && req.method === "GET") {
        if (user.role !== "admin") fail(403, "Administrator access required.");
        const users = db
          .prepare(
            `SELECT id,email,full_name,role,created_at FROM users WHERE ${adminRowScope} ORDER BY created_at DESC,email COLLATE NOCASE`,
          )
          .all(user.id);
        return json(res, 200, { users });
      }
      if (route === "/api/posts" && req.method === "GET") {
        const scope = postReadScope(user, url.searchParams.get("mine") === "1");
        const where = [scope.sql],
          params = [...scope.params];
        const kind = url.searchParams.get("kind");
        if (kind && ["Lost", "Found"].includes(kind)) {
          where.push("p.kind=?");
          params.push(kind);
        }
        const status = url.searchParams.get("status");
        if (status && statuses.includes(status)) {
          where.push("p.status=?");
          params.push(status);
        }
        const q = url.searchParams.get("q")?.trim();
        if (q) {
          where.push(
            `(instr(lower(p.item_name),lower(?))>0 OR instr(lower(p.description),lower(?))>0 OR instr(lower(p.location),lower(?))>0 OR instr(lower(p.event_at),lower(?))>0 OR instr(lower(p.kind),lower(?))>0 OR instr(lower(p.status),lower(?))>0 OR instr(lower(u.full_name),lower(?))>0)`,
          );
          for (let i = 0; i < 7; i++) params.push(q.slice(0, 200));
        }
        const posts = db
          .prepare(
            queryPosts +
              (where.length ? " WHERE " + where.join(" AND ") : "") +
              " ORDER BY p.created_at DESC,p.rowid ASC",
          )
          .all(...params);
        return json(res, 200, { posts });
      }
      if (route === "/api/posts" && req.method === "POST") {
        if (user.role !== "student")
          fail(403, "Only students can create posts.");
        const values = postData(
          await authorizedBody(req, "posts.create", user.id),
        );
        const id = randomUUID();
        const inserted = db
          .prepare(
            `INSERT INTO posts(id,user_id,kind,status,item_name,event_at,location,description,image) SELECT ?,?,?,?,?,?,?,?,? WHERE ${studentRowScope}`,
          )
          .run(id, user.id, ...values, user.id);
        if (!inserted.changes)
          fail(403, "Post creation is no longer permitted.");
        return json(res, 201, {
          post: db.prepare(queryPosts + " WHERE p.id=?").get(id),
        });
      }
      const match = /^\/api\/posts\/([a-zA-Z0-9-]+)$/.exec(route);
      if (match) {
        const post = db
          .prepare(queryPosts + ` WHERE p.id=? AND ${adminRowScope}`)
          .get(match[1], user.id);
        if (!post) fail(404, "Post not found.");
        if (user.role !== "admin")
          fail(403, "Only administrators can review or manage posts.");
        if (req.method === "GET") return json(res, 200, { post });
        if (req.method === "DELETE") {
          const deleted = db
            .prepare(`DELETE FROM posts WHERE id=? AND ${adminRowScope}`)
            .run(post.id, user.id);
          if (!deleted.changes)
            fail(403, "Post management is no longer permitted.");
          return json(res, 200, { ok: true });
        }
        if (req.method === "PUT") {
          const values = postData(
            await authorizedBody(req, "posts.manage", user.id),
            post,
          );
          const updated = db
            .prepare(
              `UPDATE posts SET kind=?,status=?,item_name=?,event_at=?,location=?,description=?,image=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND ${adminRowScope}`,
            )
            .run(...values, post.id, user.id);
          if (!updated.changes)
            fail(403, "Post management is no longer permitted.");
          return json(res, 200, {
            post: db.prepare(queryPosts + " WHERE p.id=?").get(post.id),
          });
        }
        if (req.method === "PATCH") {
          const data = await authorizedBody(req, "posts.manage", user.id);
          if (!statuses.includes(data.status)) fail(400, "Invalid status.");
          const kind = ["Lost", "Found"].includes(data.status)
            ? data.status
            : post.kind;
          const updated = db
            .prepare(
              `UPDATE posts SET kind=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND ${adminRowScope}`,
            )
            .run(kind, data.status, post.id, user.id);
          if (!updated.changes)
            fail(403, "Post management is no longer permitted.");
          return json(res, 200, {
            post: db.prepare(queryPosts + " WHERE p.id=?").get(post.id),
          });
        }
      }
      fail(404, "Not found.");
    }
    if (!["GET", "HEAD"].includes(req.method)) fail(405, "Method not allowed.");
    const relative =
      route === "/"
        ? "index.html"
        : decodeURIComponent(route).replace(/^\/+/, "");
    const base = path.join(root, "public"),
      file = path.resolve(base, relative);
    if (!file.startsWith(base + path.sep)) fail(403, "Forbidden.");
    const assetParts = path
      .relative(base, file)
      .split(path.sep)
      .map((part) => part.toLowerCase());
    if (assetParts[0] === "assets" && assetParts[1] === "originals")
      fail(404, "Not found.");
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".png": "image/png",
    };
    if (!types[path.extname(file)]) fail(404, "Not found.");
    let bytes;
    try {
      bytes = await readFile(file);
    } catch {
      fail(404, "Not found.");
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)],
      "Cache-Control": "no-cache",
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch (error) {
    if (!res.headersSent)
      json(res, error.status || 500, {
        error: error.status ? error.message : "Server error.",
      });
    else res.end();
    if (!error.status) console.error(error);
  }
});
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? "This port is already in use. Stop the other server or set a different PORT."
      : error.message,
  );
  process.exitCode = 1;
});
if (process.env.NODE_ENV !== "test")
  server.listen(
    Number(process.env.PORT || 3000),
    process.env.HOST || "127.0.0.1",
    () =>
      console.log(
        `RETURNO running at http://localhost:${server.address().port}`,
      ),
  );
