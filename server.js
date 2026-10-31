import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { randomUUID, randomBytes, randomInt, createHash, createHmac } from "node:crypto";
import { isIP } from "node:net";
import sharp from "sharp";
import { db, root, createUser, verifyPassword, hashPassword } from "./db.js";
import {
  authorize,
  requestPermission,
  postReadScope,
  adminRowScope,
  studentRowScope,
} from "./access-control.js";

import { sendVerification, sendPasswordReset, sendPasswordChanged } from "./mail.js";
import {
  digestVerificationCode,
  isCurrentVerificationCodeDigest,
  verifyVerificationCode,
} from "./verification-codes.js";
import { createRequestRateLimiter, createPostgresRequestRateLimiter } from "./request-rate-limit.js";
import { assertCodePepper } from "./verification-codes.js";
import { createImageUpload, downloadImage, imageUrl, replaceImage, deleteImage, storageOrigin } from "./supabase-storage.js";

const statuses = ["Lost", "Found", "Claimed", "Returned"];
const sessionAge = 7 * 24 * 60 * 60 * 1000;
const termsVersion = "1.0";
const privacyVersion = "1.2";
if (process.env.VERCEL === "1" && process.env.RETURNO_POSTGRES_READY === "true")
  assertCodePepper();
const postgresMode = typeof db.withRequest === "function";
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
const queryPosts = `SELECT p.id,p.user_id,p.kind,p.status,p.item_name,p.event_at,p.location,p.description,p.image,p.contact_email,p.contact_phone,p.contact_details,p.created_at,p.updated_at,u.full_name AS author FROM posts p JOIN users u ON u.id=p.user_id`;
function publicPost(post) {
  return post && postgresMode && post.image
    ? { ...post, image: imageUrl(post.id) }
    : post;
}
function publicPosts(posts) {
  return postgresMode ? posts.map(publicPost) : posts;
}
async function cleanupImage(image) {
  if (!postgresMode || !image) return;
  try { await deleteImage(image); }
  catch { console.error("Report image cleanup failed."); }
}
const allowSensitiveRequest = createRequestRateLimiter({
  limit: 40,
  windowMs: 15 * 60 * 1000,
  maxKeys: 20_000,
});
const allowPersistentSensitiveRequest = postgresMode
  ? createPostgresRequestRateLimiter({
      db,
      limit: 40,
      windowMs: 15 * 60 * 1000,
      maxKeys: 20_000,
    })
  : null;
const deliveries = new Set();

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
    if (size > 15 * 1024 * 1024) fail(413, "Image must be 10 MB or smaller.");
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
async function auth(req) {
  const token = (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("retorno_session="))
    ?.slice(16);
  if (!token) fail(401, "Please log in.");
  const user = await db
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
  const currentUser = await auth(req);
  if (currentUser.id !== expectedId) fail(401, "Please log in again.");
  authorize(currentUser, permission);
  return data;
}
async function createSession(user) {
  await db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
  const token = randomBytes(32).toString("hex");
  await db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
    hash(token),
    user.id,
    Date.now() + sessionAge,
  );
  return token;
}
async function login(res, user) {
  cookie(res, await createSession(user));
  json(res, 200, { user: publicUser(user) });
}
const maxImageBytes = 10 * 1024 * 1024;
const maxImagePixels = 16_000_000;
const maxImageDimension = 8_000;
const storedImageDimension = 2_560;

async function imageData(value) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") fail(400, "Invalid image.");
  const match =
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) fail(400, "Use a PNG, JPEG, or WebP image.");
  if (match[2].length > Math.ceil(maxImageBytes / 3) * 4)
    fail(413, "Image must be 10 MB or smaller.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > maxImageBytes)
    fail(413, "Image must be 10 MB or smaller.");
  const valid =
    match[1] === "png"
      ? bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
      : match[1] === "jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WEBP";
  if (!valid) fail(400, "Invalid image content.");
  let metadata;
  try {
    metadata = await sharp(bytes, {
      failOn: "warning",
      // Read dimensions without allocating decoded pixels, then enforce our
      // stricter limits before any full decode or transform is attempted.
      limitInputPixels: false,
      limitInputChannels: 4,
      animated: true,
      pages: -1,
    }).metadata();
  } catch {
    fail(400, "Image is damaged or cannot be decoded.");
  }
  if (
    metadata.format !== match[1] ||
    !metadata.width ||
    !metadata.height
  )
    fail(400, "Image content does not match its file type.");
  if (
    metadata.width > maxImageDimension ||
    metadata.height > maxImageDimension ||
    metadata.width * metadata.height > maxImagePixels
  )
    fail(413, "Image dimensions are too large. Use an image under 16 megapixels and 8,000 pixels per side.");
  if (metadata.pages > 1)
    fail(400, "Animated images are not supported. Choose a still image.");

  let output;
  let outputFormat = match[1];
  try {
    const pipeline = () =>
      sharp(bytes, {
        failOn: "warning",
        limitInputPixels: maxImagePixels,
        limitInputChannels: 4,
        pages: 1,
      })
        .rotate()
        .resize({
          width: storedImageDimension,
          height: storedImageDimension,
          fit: "inside",
          withoutEnlargement: true,
        });
    output = await (outputFormat === "jpeg"
      ? pipeline().jpeg({ quality: 84, mozjpeg: true }).toBuffer()
      : outputFormat === "webp"
        ? pipeline().webp({ quality: 82, effort: 4 }).toBuffer()
        : pipeline().png({ compressionLevel: 9 }).toBuffer());
    if (output.length > maxImageBytes && outputFormat === "png") {
      output = await pipeline().webp({ quality: 85, effort: 4 }).toBuffer();
      outputFormat = "webp";
    }
  } catch {
    fail(400, "Image is damaged or cannot be decoded.");
  }
  if (output.length > maxImageBytes)
    fail(413, "Processed image is larger than 10 MB. Choose a smaller image.");
  return `data:image/${outputFormat};base64,${output.toString("base64")}`;
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
function contactField(data, key, previous, max) {
  const value = data[key] === undefined ? (previous?.[key] ?? "") : data[key];
  if (typeof value !== "string" || value.length > max) fail(400, "Invalid contact details.");
  return value.trim();
}
async function postData(data, previous, userId) {
  const kind = data.kind;
  if (!["Lost", "Found"].includes(kind)) fail(400, "Select Lost or Found.");
  const status = previous ? (data.status ?? previous.status) : kind;
  if (!statuses.includes(status)) fail(400, "Invalid status.");
  if (["Lost", "Found"].includes(status) && status !== kind)
    fail(400, "Active status must match Lost / Found type.");
  const eventAt = textField(data, "event_at", 32);
  if (!validEventTime(eventAt)) fail(400, "Enter a valid date and time.");
  const contactEmail = contactField(data, "contact_email", previous, 254).toLowerCase();
  const contactPhone = contactField(data, "contact_phone", previous, 30);
  if (contactEmail && !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@gmail\.com$/i.test(contactEmail)) fail(400, "Enter a valid Gmail contact address.");
  if (contactPhone && (!/^\+?[0-9 ()-]+$/.test(contactPhone) || contactPhone.replace(/\D/g, "").length < 7 || contactPhone.replace(/\D/g, "").length > 15)) fail(400, "Enter a valid contact number (7-15 digits).");
  let image = data.image === undefined || (previous && data.image === previous.image)
    ? (previous?.image ?? null)
    : await imageData(data.image);
  if (postgresMode && data.imageKey !== undefined) {
    const key = data.imageKey;
    if (typeof key !== "string" || !key.startsWith(`${userId}/`) ||
      !/^[a-zA-Z0-9-]+\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(key))
      fail(400, "Invalid image upload. Please choose the image again.");
    try {
      const response = await downloadImage(key);
      const mime = response.headers.get("content-type")?.split(";")[0];
      if (!response.ok || !["image/png", "image/jpeg", "image/webp"].includes(mime))
        fail(400, "Use a PNG, JPEG, or WebP image.");
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > maxImageBytes) fail(413, "Image must be 10 MB or smaller.");
      const normalized = await imageData(`data:${mime};base64,${bytes.toString("base64")}`);
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(normalized);
      if (!match) fail(400, "Invalid image content.");
      await replaceImage(key, Buffer.from(match[2], "base64"), match[1]);
      image = key;
    } catch (error) {
      await cleanupImage(key);
      if (error.status) throw error;
      fail(400, "Image upload was not found or could not be processed. Please choose it again.");
    }
  }
  if (postgresMode && data.image !== undefined && data.imageKey === undefined && data.image !== previous?.image)
    fail(400, "Upload the image directly before saving the report.");
  return [
    kind,
    status,
    textField(data, "item_name"),
    eventAt,
    textField(data, "location", 500),
    textField(data, "description", 3000),
    image,
    contactEmail,
    contactPhone,
    contactField(data, "contact_details", previous, 500),
  ];
}
function clientAddress(req) {
  if (process.env.VERCEL === "1") {
    const forwarded = req.headers["x-forwarded-for"];
    const candidate = typeof forwarded === "string" ? forwarded.split(",", 1)[0].trim() : "";
    if (isIP(candidate)) return candidate;
  }
  const remote = req.socket?.remoteAddress;
  return typeof remote === "string" && isIP(remote) ? remote : "unknown";
}
function rateLimitKey(address) {
  assertCodePepper();
  return createHmac("sha256", Buffer.from(process.env.RETURNO_CODE_PEPPER, "hex"))
    .update("RETURNO:request-rate-limit:v1:")
    .update(address)
    .digest("hex");
}
async function rateLimit(req) {
  const address = clientAddress(req);
  const allowed = postgresMode
    ? await allowPersistentSensitiveRequest(rateLimitKey(address))
    : allowSensitiveRequest(address);
  if (!allowed)
    fail(429, "Too many attempts. Try again later.");
}
async function resolveOutcomeNotificationsForPost(postId, adminId) {
  const proofs = (await db.prepare(`SELECT proof_image FROM item_outcome_notifications
    WHERE post_id=? AND reviewed_at IS NULL AND proof_image IS NOT NULL AND ${adminRowScope}`)
    .all(postId, adminId)).map((row) => row.proof_image);
  await db.prepare(`UPDATE item_outcome_notifications SET reviewed_at=CURRENT_TIMESTAMP,reviewed_by=?,proof_image=NULL
    WHERE post_id=? AND reviewed_at IS NULL AND ${adminRowScope}`).run(adminId, postId, adminId);
  return proofs;
}

async function handleRequestScoped(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  const storageHost = storageOrigin();
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'self'; img-src 'self' data:; connect-src 'self'${storageHost ? ` ${storageHost}` : ""}; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
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
        await db.prepare("SELECT 1").get();
        return json(res, 200, { service: "retorno", version: "1.3.0", directImageUpload: postgresMode });
      }
      if (route === "/api/register" && req.method === "POST") {
        await rateLimit(req);
        const data = await body(req),
          { email, password } = credentials(data);
        const fullName = textField(data, "fullName", 100);
        if (data.policyAgreement !== true)
          fail(400, "Please agree to the Terms & Conditions and acknowledge the Privacy Policy.");
        if (data.confirmPassword !== password)
          fail(400, "Passwords do not match.");
        if (await db.prepare("SELECT id FROM users WHERE email=?").get(email))
          fail(409, "Email is already registered.");
        const now = Date.now();
        const code = String(randomInt(100000, 1000000));
        const passwordHash = hashPassword(password);
        const codeHash = digestVerificationCode("signup", code);
        if (postgresMode) {
          // Keep the reservation separate so failed SMTP does not invalidate an
          // older, still-usable code. The unique key coordinates Vercel instances.
          const reservation = await db.prepare(`INSERT INTO email_delivery_reservations
            (email,purpose,reserved_at) VALUES(?,'signup',?)
            ON CONFLICT(email,purpose) DO UPDATE SET reserved_at=excluded.reserved_at
            WHERE email_delivery_reservations.reserved_at <= ?
            AND NOT EXISTS (SELECT 1 FROM pending_registrations p
              WHERE p.email=excluded.email AND p.sent_at > ?) RETURNING email`)
            .get(email, now, now - 60000, now - 60000);
          if (!reservation)
            fail(429, "Wait one minute before requesting another code.");
          try {
            await sendVerification(email, code);
          } catch {
            await db.prepare("DELETE FROM email_delivery_reservations WHERE email=? AND purpose='signup' AND reserved_at=?")
              .run(email, now);
            fail(503, "Could not send the verification email. Please try again later or contact the administrator.");
          }
          try {
            if (await db.prepare("SELECT id FROM users WHERE email=?").get(email))
              fail(409, "Email is already registered.");
            await db.prepare("DELETE FROM pending_registrations WHERE expires_at <= ?").run(now);
            await db.prepare(`INSERT INTO pending_registrations(email,full_name,password_hash,code_hash,expires_at,sent_at,terms_version,privacy_version)
              VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET full_name=excluded.full_name,
              password_hash=excluded.password_hash,code_hash=excluded.code_hash,
              expires_at=excluded.expires_at,sent_at=excluded.sent_at,attempts=0,
              terms_version=excluded.terms_version,privacy_version=excluded.privacy_version`)
              .run(email, fullName, passwordHash, codeHash, now + 10 * 60000, now, termsVersion, privacyVersion);
          } finally {
            await db.prepare("DELETE FROM email_delivery_reservations WHERE email=? AND purpose='signup' AND reserved_at=?")
              .run(email, now);
          }
        } else {
          const pending = await db
            .prepare("SELECT sent_at FROM pending_registrations WHERE email=?")
            .get(email);
          if (pending && now - pending.sent_at < 60000)
            fail(429, "Wait one minute before requesting another code.");
          if (deliveries.has(email))
            fail(429, "A verification email is already being sent.");
          deliveries.add(email);
          try {
            await sendVerification(email, code);
          } catch {
            fail(503, "Could not send the verification email. Please try again later or contact the administrator.");
          } finally {
            deliveries.delete(email);
          }
          if (await db.prepare("SELECT id FROM users WHERE email=?").get(email))
            fail(409, "Email is already registered.");
          await db.prepare("DELETE FROM pending_registrations WHERE expires_at <= ?").run(now);
          await db.prepare(`INSERT INTO pending_registrations(email,full_name,password_hash,code_hash,expires_at,sent_at,terms_version,privacy_version)
            VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET full_name=excluded.full_name,
            password_hash=excluded.password_hash,code_hash=excluded.code_hash,
            expires_at=excluded.expires_at,sent_at=excluded.sent_at,attempts=0,
            terms_version=excluded.terms_version,privacy_version=excluded.privacy_version`)
            .run(email, fullName, passwordHash, codeHash, now + 10 * 60000, now, termsVersion, privacyVersion);
        }
        return json(res, 202, { verificationRequired: true, email });
      }
      if (route === "/api/verify-email" && req.method === "POST") {
        await rateLimit(req);
        const data = await body(req);
        const email = textField(data, "email", 254).toLowerCase();
        const code = textField(data, "code", 6);
        const pending = await db
          .prepare("SELECT * FROM pending_registrations WHERE email=?")
          .get(email);
        if (pending && (!pending.terms_version || !pending.privacy_version)) {
          await db.prepare("DELETE FROM pending_registrations WHERE email=?").run(email);
          fail(400, "Please register again and accept the current policies.");
        }
        if (
          !pending ||
          pending.expires_at <= Date.now() ||
          pending.attempts >= 5
        )
          fail(
            400,
            "Code expired or unavailable. Register again to request a new code.",
          );
        if (!isCurrentVerificationCodeDigest(pending.code_hash)) {
          await db.prepare("DELETE FROM pending_registrations WHERE email=?").run(email);
          fail(400, "This verification code is no longer valid. Register again to request a new code.");
        }
        await db.prepare(
          "UPDATE pending_registrations SET attempts=attempts+1 WHERE email=?",
        ).run(email);
        if (!/^\d{6}$/.test(code) || !verifyVerificationCode("signup", code, pending.code_hash))
          fail(400, "Incorrect verification code.");
        let user, token;
        await db.exec("BEGIN IMMEDIATE");
        try {
          const id = randomUUID();
          await db.prepare(
            "INSERT INTO users(id,email,full_name,password_hash,role) VALUES(?,?,?,?,'student')",
          ).run(id, email, pending.full_name, pending.password_hash);
          user = await db.prepare("SELECT * FROM users WHERE id=?").get(id);
          await db.prepare("INSERT INTO policy_acceptances(user_id,terms_version,privacy_version) VALUES(?,?,?)")
            .run(id, pending.terms_version, pending.privacy_version);
          token = await createSession(user);
          await db.prepare("DELETE FROM pending_registrations WHERE email=?").run(
            email,
          );
          await db.exec("COMMIT");
        } catch (error) {
          await db.exec("ROLLBACK");
          throw error;
        }
        cookie(res, token);
        return json(res, 201, { user: publicUser(user) });
      }
      if (route === "/api/forgot-password" && req.method === "POST") {
        await rateLimit(req);
        const data = await body(req);
        const email = textField(data, "email", 254).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Enter a valid email.");
        const target = await db.prepare("SELECT id,email,password_hash FROM users WHERE email=? AND role='student'").get(email);
        const now = Date.now();
        await db.prepare("DELETE FROM password_resets WHERE expires_at<=?").run(now);
        const pending = target && await db.prepare("SELECT sent_at FROM password_resets WHERE user_id=?").get(target.id);
        if (target && (postgresMode || !pending || now - pending.sent_at >= 60000)) {
          const code = String(randomInt(100000, 1000000));
          const codeHash = digestVerificationCode("password-reset", code);
          const reservation = await db.prepare(`INSERT INTO password_resets(user_id,code_hash,password_version,expires_at,sent_at)
            VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash,
            password_version=excluded.password_version,expires_at=excluded.expires_at,sent_at=excluded.sent_at,attempts=0
            WHERE password_resets.sent_at <= ? RETURNING user_id`)
            .get(target.id,codeHash,target.password_hash,now+10*60000,now,now-60000);
          if (reservation) {
            // SMTP runs off the response path so account existence is not exposed by delivery timing.
            void sendPasswordReset(target.email, code).catch(async () => {
              await db.prepare("DELETE FROM password_resets WHERE user_id=? AND code_hash=?").run(target.id,codeHash);
              console.error("Password reset email delivery failed.");
            });
          }
        }
        return json(res, 202, { message: "If this email belongs to a student account, a reset code will be sent. Check your inbox and spam folder. Wait one minute before requesting another code. If no email arrives, contact the administrator." });
      }
      if (route === "/api/reset-password" && req.method === "POST") {
        await rateLimit(req);
        const data = await body(req);
        const { email, password } = credentials(data);
        if (data.confirmPassword !== password) fail(400, "Passwords do not match.");
        const code = textField(data,"code",6);
        const target = await db.prepare(`SELECT u.id,u.email,u.password_hash,r.code_hash,r.password_version,r.expires_at,r.attempts
          FROM users u JOIN password_resets r ON r.user_id=u.id WHERE u.email=? AND u.role='student'`).get(email);
        const invalid = "Invalid or expired reset code. Request a new code.";
        if (!target || target.expires_at<=Date.now() || target.attempts>=5 || target.password_hash!==target.password_version) fail(400,invalid);
        if (!isCurrentVerificationCodeDigest(target.code_hash)) {
          await db.prepare("DELETE FROM password_resets WHERE user_id=?").run(target.id);
          fail(400, invalid);
        }
        await db.prepare("UPDATE password_resets SET attempts=attempts+1 WHERE user_id=?").run(target.id);
        if (!/^\d{6}$/.test(code) || !verifyVerificationCode("password-reset", code, target.code_hash)) fail(400,invalid);
        const passwordHash = hashPassword(password);
        await db.exec("BEGIN IMMEDIATE");
        try {
          const updated = await db.prepare("UPDATE users SET password_hash=? WHERE id=? AND role='student' AND password_hash=?").run(passwordHash,target.id,target.password_version);
          if (!updated.changes) fail(400,invalid);
          await db.prepare("DELETE FROM sessions WHERE user_id=?").run(target.id);
          await db.prepare("DELETE FROM password_resets WHERE user_id=?").run(target.id);
          await db.exec("COMMIT");
        } catch (error) { await db.exec("ROLLBACK"); throw error; }
        void sendPasswordChanged(target.email).catch(() => console.error("Password change notification delivery failed."));
        return json(res, 200, { message: "Password changed. Please log in with your new password." });
      }
      if (route === "/api/login" && req.method === "POST") {
        await rateLimit(req);
        const data = await body(req),
          { email, password } = credentials(data);
        const user = await db.prepare("SELECT * FROM users WHERE email=?").get(email);
        if (
          !user ||
          !verifyPassword(password, user.password_hash) ||
          user.role !== data.role
        )
          fail(401, "Incorrect email, password, or role.");
        return await login(res, user);
      }
      const user = await auth(req);
      authorize(user, requestPermission(route, req.method));
      if (route === "/api/report-images/upload-ticket" && req.method === "POST") {
        if (!postgresMode) fail(404, "Direct image upload is unavailable.");
        const data = await authorizedBody(req, "images.upload", user.id);
        if (Object.keys(data).sort().join(",") !== "contentType,size" ||
          !Number.isInteger(data.size) || data.size < 1 || data.size > maxImageBytes)
          fail(400, "Choose a PNG, JPEG, or WebP image 10 MB or smaller.");
        const ticket = await createImageUpload(user.id, data.contentType);
        return json(res, 201, ticket);
      }
      const proofTicketMatch = /^\/api\/posts\/([a-zA-Z0-9-]+)\/outcome-notifications\/proof-upload-ticket$/.exec(route);
      if (proofTicketMatch && req.method === "POST") {
        const data = await authorizedBody(req, "outcome-notifications.create", user.id);
        if (!postgresMode) fail(404, "Direct proof upload is unavailable.");
        if (Object.keys(data).sort().join(",") !== "contentType,size" ||
          !Number.isInteger(data.size) || data.size < 1 || data.size > maxImageBytes)
          fail(400, "Choose a PNG, JPEG, or WebP proof image 10 MB or smaller.");
        const post = await db.prepare(`SELECT p.id FROM posts p WHERE p.id=? AND p.user_id=?
          AND p.status IN ('Lost','Found') AND ${studentRowScope}`).get(proofTicketMatch[1], user.id, user.id);
        if (!post) fail(404, "Active post not found.");
        const pending = await db.prepare("SELECT id FROM item_outcome_notifications WHERE post_id=? AND reviewed_at IS NULL").get(post.id);
        if (pending) fail(409, "An administrator has already been notified about this post.");
        await rateLimit(req);
        return json(res, 201, await createImageUpload(user.id, data.contentType));
      }
      const outcomeProofMatch = /^\/api\/item-outcome-notifications\/([a-zA-Z0-9-]+)\/proof$/.exec(route);
      if (outcomeProofMatch && req.method === "GET") {
        const notification = await db.prepare(`SELECT n.proof_image FROM item_outcome_notifications n
          WHERE n.id=? AND n.reviewed_at IS NULL AND ${adminRowScope}`)
          .get(outcomeProofMatch[1], user.id);
        if (!notification?.proof_image) fail(404, "Pending proof image not found.");
        let bytes, mime;
        if (postgresMode) {
          let response;
          try { response = await downloadImage(notification.proof_image); }
          catch { fail(404, "Proof image not found."); }
          mime = response.headers.get("content-type")?.split(";")[0];
          if (!response.ok || !["image/png", "image/jpeg", "image/webp"].includes(mime)) fail(404, "Proof image not found.");
          bytes = Buffer.from(await response.arrayBuffer());
        } else {
          const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(notification.proof_image);
          if (!match) fail(404, "Proof image not found.");
          mime = match[1];
          bytes = Buffer.from(match[2], "base64");
        }
        res.writeHead(200, { "Content-Type": mime, "Content-Length": bytes.length,
          "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
        return res.end(bytes);
      }
      const imageMatch = /^\/api\/post-images\/([a-zA-Z0-9-]+)$/.exec(route);
      if (imageMatch && req.method === "GET") {
        const post = await db.prepare("SELECT image FROM posts WHERE id=?").get(imageMatch[1]);
        if (!post?.image) fail(404, "Image not found.");
        let response;
        try { response = await downloadImage(post.image); }
        catch { fail(404, "Image not found."); }
        const mime = response.headers.get("content-type")?.split(";")[0];
        if (!response.ok || !["image/png", "image/jpeg", "image/webp"].includes(mime)) fail(404, "Image not found.");
        const bytes = Buffer.from(await response.arrayBuffer());
        res.writeHead(200, { "Content-Type": mime, "Content-Length": bytes.length,
          "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
        return res.end(req.method === "HEAD" ? undefined : bytes);
      }
      if (route === "/api/admins" && req.method === "POST") {
        if (user.role !== "admin")
          fail(403, "Only administrators can register another admin.");
        const data = await authorizedBody(req, "admins.create", user.id),
          { email, password } = credentials(data),
          fullName = textField(data, "fullName", 100);
        if (data.confirmPassword !== password)
          fail(400, "Passwords do not match.");
        if (await db.prepare("SELECT id FROM users WHERE email=?").get(email))
          fail(409, "Email is already registered.");
        const id = await createUser(email, fullName, password, "admin");
        return json(res, 201, {
          user: publicUser(
            await db.prepare("SELECT * FROM users WHERE id=?").get(id),
          ),
        });
      }
      if (route === "/api/me" && req.method === "GET")
        return json(res, 200, { user: publicUser(user) });
      if (route === "/api/account-deletion-request" && req.method === "GET") {
        const request = await db.prepare(`SELECT user_id,requested_at FROM account_deletion_requests WHERE user_id=? AND ${studentRowScope}`).get(user.id, user.id);
        return json(res, 200, { request: request ? { requestedAt: request.requested_at } : null });
      }
      if (route === "/api/account-deletion-request" && req.method === "POST") {
        const data = await authorizedBody(req, "account-deletion.request", user.id);
        if (Object.keys(data).length) fail(400, "This request does not accept additional details.");
        const created = await db.prepare(`INSERT OR IGNORE INTO account_deletion_requests(user_id) SELECT ? WHERE ${studentRowScope}`).run(user.id, user.id);
        const request = await db.prepare(`SELECT requested_at FROM account_deletion_requests WHERE user_id=? AND ${studentRowScope}`).get(user.id, user.id);
        if (!request) fail(403, "Student access is required.");
        return json(res, created.changes ? 201 : 200, { request: { requestedAt: request.requested_at } });
      }
      if (route === "/api/account-deletion-request" && req.method === "DELETE") {
        const cancelled = await db.prepare(`DELETE FROM account_deletion_requests WHERE user_id=? AND ${studentRowScope}`).run(user.id, user.id);
        if (!cancelled.changes) fail(404, "No pending account deletion request.");
        return json(res, 200, { ok: true });
      }
      if (route === "/api/item-outcome-notifications" && req.method === "GET") {
        const notifications = await db.prepare(`SELECT n.id,n.post_id,n.outcome,n.created_at,
          CASE WHEN n.proof_image IS NULL THEN 0 ELSE 1 END AS has_proof,
          p.kind,p.status AS current_status,p.item_name,p.location,u.full_name AS student_name
          FROM item_outcome_notifications n
          JOIN posts p ON p.id=n.post_id
          JOIN users u ON u.id=n.student_id
          WHERE n.reviewed_at IS NULL AND ${adminRowScope}
          ORDER BY n.created_at DESC,n.id`).all(user.id);
        return json(res, 200, { notifications });
      }
      const studentOutcomeMatch = /^\/api\/posts\/([a-zA-Z0-9-]+)\/outcome-notifications$/.exec(route);
      if (studentOutcomeMatch && req.method === "POST") {
        const data = await authorizedBody(req, "outcome-notifications.create", user.id);
        await rateLimit(req);
        const expectedKeys = postgresMode ? "imageKey,outcome" : "image,outcome";
        if (Object.keys(data).sort().join(",") !== expectedKeys || !["Claimed", "Returned"].includes(data.outcome))
          fail(400, "Choose the outcome and attach a proof image.");
        const postId = studentOutcomeMatch[1];
        const post = await db.prepare(`SELECT p.id,p.status,p.kind FROM posts p WHERE p.id=? AND p.user_id=? AND p.status IN ('Lost','Found') AND ${studentRowScope}`).get(postId, user.id, user.id);
        if (!post) fail(404, "Active post not found.");
        const expectedOutcome = post.kind === "Lost" ? "Claimed" : "Returned";
        if (data.outcome !== expectedOutcome) fail(400, "Choose the outcome that matches this post type.");
        const pending = await db.prepare("SELECT id FROM item_outcome_notifications WHERE post_id=? AND reviewed_at IS NULL").get(postId);
        if (pending) fail(409, "An administrator has already been notified about this post.");
        const id = randomUUID();
        let proofImage = null;
        let uploadedKey = null;
        try {
          if (postgresMode) {
            uploadedKey = data.imageKey;
            if (typeof uploadedKey !== "string" || !uploadedKey.startsWith(`${user.id}/`) ||
              !/^[a-zA-Z0-9-]+\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(uploadedKey))
              fail(400, "Upload a proof image before sending the notification.");
            const response = await downloadImage(uploadedKey);
            const mime = response.headers.get("content-type")?.split(";")[0];
            if (!response.ok || !["image/png", "image/jpeg", "image/webp"].includes(mime))
              fail(400, "Use a PNG, JPEG, or WebP proof image.");
            const bytes = Buffer.from(await response.arrayBuffer());
            if (bytes.length > maxImageBytes) fail(413, "Proof image must be 10 MB or smaller.");
            const normalizedProof = await imageData(`data:${mime};base64,${bytes.toString("base64")}`);
            const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(normalizedProof);
            await replaceImage(uploadedKey, Buffer.from(match[2], "base64"), match[1]);
            proofImage = uploadedKey;
          } else {
            proofImage = await imageData(data.image);
            if (!proofImage) fail(400, "Attach a proof image before sending the notification.");
          }
          const created = await db.prepare(`INSERT INTO item_outcome_notifications(id,post_id,student_id,outcome,proof_image)
            SELECT ?,p.id,?,?,? FROM posts p WHERE p.id=? AND p.user_id=? AND p.status IN ('Lost','Found') AND ${studentRowScope}
            ON CONFLICT DO NOTHING`).run(id, user.id, data.outcome, proofImage, postId, user.id, user.id);
          if (!created.changes) fail(409, "An administrator has already been notified about this post.");
        } catch (error) {
          if (postgresMode && uploadedKey?.startsWith(`${user.id}/`)) await cleanupImage(uploadedKey);
          throw error;
        }
        return json(res, 201, { notification: { id, postId, outcome: data.outcome } });
      }
      const reviewOutcomeMatch = /^\/api\/item-outcome-notifications\/([a-zA-Z0-9-]+)$/.exec(route);
      if (reviewOutcomeMatch && req.method === "PATCH") {
        const data = await authorizedBody(req, "outcome-notifications.review", user.id);
        if (Object.keys(data).length !== 1 || !["Claimed", "Returned", "Dismissed"].includes(data.status))
          fail(400, "Choose Claimed, Returned, or Dismissed.");
        const notificationId = reviewOutcomeMatch[1];
        await db.exec("BEGIN IMMEDIATE");
        try {
          const notification = await db.prepare(`SELECT n.id,n.post_id,n.outcome,n.proof_image FROM item_outcome_notifications n
            WHERE n.id=? AND n.reviewed_at IS NULL AND ${adminRowScope}`).get(notificationId, user.id);
          if (!notification) fail(404, "Pending notification not found.");
          if (data.status !== "Dismissed" && data.status !== notification.outcome)
            fail(400, `This notification can only set the status to ${notification.outcome}.`);
          if (data.status !== "Dismissed" && !notification.proof_image)
            fail(409, "This request has no proof image. Dismiss it and ask the student to submit a new request with proof.");
          if (data.status !== "Dismissed") {
            const changedPost = await db.prepare(`UPDATE posts SET status=?,updated_at=CURRENT_TIMESTAMP
              WHERE id=? AND status IN ('Lost','Found') AND ${adminRowScope}`).run(data.status, notification.post_id, user.id);
            if (!changedPost.changes) fail(409, "This report is no longer active. Refresh the dashboard and review the post.");
          }
          const reviewed = await db.prepare(`UPDATE item_outcome_notifications SET reviewed_at=CURRENT_TIMESTAMP,reviewed_by=?,proof_image=NULL
            WHERE id=? AND reviewed_at IS NULL AND ${adminRowScope}`).run(user.id, notificationId, user.id);
          if (!reviewed.changes) fail(409, "This notification was already reviewed. Refresh the dashboard.");
          await db.exec("COMMIT");
          if (postgresMode) await cleanupImage(notification.proof_image);
          return json(res, 200, { ok: true, status: data.status });
        } catch (error) {
          try { await db.exec("ROLLBACK"); } catch {}
          throw error;
        }
      }
      if (route === "/api/logout" && req.method === "POST") {
        const token = (req.headers.cookie || "").match(
          /(?:^|;\s*)retorno_session=([^;]+)/,
        )?.[1];
        if (token)
          await db.prepare(
            "DELETE FROM sessions WHERE token_hash=? AND user_id=?",
          ).run(hash(token), user.id);
        cookie(res, "", 0);
        return json(res, 200, { ok: true });
      }
      if (route === "/api/stats" && req.method === "GET") {
        if (user.role !== "admin") fail(403, "Administrator access required.");
        const stats = Object.fromEntries(statuses.map((s) => [s, 0]));
        for (const row of await db
          .prepare(
            `SELECT status,COUNT(*) AS count FROM posts WHERE ${adminRowScope} GROUP BY status`,
          )
          .all(user.id))
          stats[row.status] = Number(row.count);
        return json(res, 200, { stats });
      }
      const accountMatch = /^\/api\/users\/([a-zA-Z0-9-]+)$/.exec(route);
      if (accountMatch && req.method === "DELETE") {
        const data = await authorizedBody(req, "users.delete", user.id);
        const id = accountMatch[1];
        if (id === user.id) fail(409, "You cannot delete your own administrator account.");
        const target = await db.prepare(`SELECT id,email FROM users WHERE id=? AND ${adminRowScope}`).get(id, user.id);
        if (!target) fail(404, "Account not found.");
        if (textField(data, "confirmEmail", 254).toLowerCase() !== target.email)
          fail(400, "Enter the account's email address to confirm deletion.");
        const images = postgresMode
          ? (await db.prepare("SELECT image FROM posts WHERE user_id=? AND image IS NOT NULL").all(id)).map(row => row.image)
          : [];
        const outcomeProofs = postgresMode
          ? (await db.prepare(`SELECT n.proof_image FROM item_outcome_notifications n
              JOIN posts p ON p.id=n.post_id WHERE (n.student_id=? OR p.user_id=?) AND n.proof_image IS NOT NULL`)
              .all(id, id)).map(row => row.proof_image)
          : [];
        // Foreign-key cascades remove the target's reports and all sessions atomically.
        const deleted = await db.prepare(`DELETE FROM users WHERE id=? AND id<>? AND ${adminRowScope}`).run(id, user.id, user.id);
        if (!deleted.changes) fail(403, "Account deletion was not permitted.");
        await Promise.all(images.map(cleanupImage));
        await Promise.all(outcomeProofs.map(cleanupImage));
        return json(res, 200, { ok: true });
      }
      if (route === "/api/users" && req.method === "GET") {
        if (user.role !== "admin") fail(403, "Administrator access required.");
        const users = await db
          .prepare(
            `SELECT u.id,u.email,u.full_name,u.role,u.created_at,r.requested_at AS deletion_requested_at FROM users u LEFT JOIN account_deletion_requests r ON r.user_id=u.id WHERE ${adminRowScope} ORDER BY u.created_at DESC,u.email COLLATE NOCASE`,
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
          where.push("p.kind=? AND p.status=?");
          params.push(kind, kind);
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
        const selectPosts = url.searchParams.get("mine") === "1" && user.role === "student"
          ? queryPosts.replace("u.full_name AS author", "u.full_name AS author,(SELECT n.outcome FROM item_outcome_notifications n WHERE n.post_id=p.id AND n.reviewed_at IS NULL) AS pending_outcome")
          : queryPosts;
        const filtered = selectPosts + " WHERE " + where.join(" AND ");
        const order = " ORDER BY p.created_at DESC,p.rowid ASC";
        if (url.searchParams.has("page") || url.searchParams.has("pageSize")) {
          const rawPage = url.searchParams.get("page") ?? "1";
          const rawSize = url.searchParams.get("pageSize") ?? "28";
          if (!/^[1-9][0-9]{0,5}$/.test(rawPage) || !/^[1-9][0-9]{0,2}$/.test(rawSize) || Number(rawSize) > 100)
            fail(400, "Invalid pagination parameters.");
          const pageSize = Number(rawSize);
          const totalRow = await db.prepare("SELECT COUNT(*) AS total FROM (" + filtered + ")").get(...params);
          const total = Number(totalRow.total);
          const totalPages = Math.max(1, Math.ceil(total / pageSize));
          const page = Math.min(Number(rawPage), totalPages);
          const posts = await db.prepare(filtered + order + " LIMIT ? OFFSET ?").all(...params, pageSize, (page - 1) * pageSize);
          return json(res, 200, { posts: publicPosts(posts), pagination: { page, pageSize, total, totalPages } });
        }
        const posts = await db.prepare(filtered + order).all(...params);
        return json(res, 200, { posts: publicPosts(posts) });
      }
      if (route === "/api/posts" && req.method === "POST") {
        if (user.role !== "student")
          fail(403, "Only students can create posts.");
        const values = await postData(
          await authorizedBody(req, "posts.create", user.id), null, user.id,
        );
        const id = randomUUID();
        let inserted;
        try {
          inserted = await db
            .prepare(
              `INSERT INTO posts(id,user_id,kind,status,item_name,event_at,location,description,image,contact_email,contact_phone,contact_details) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE ${studentRowScope}`,
            )
            .run(id, user.id, ...values, user.id);
        } catch (error) {
          await cleanupImage(values[6]);
          throw error;
        }
        if (!inserted.changes) {
          await cleanupImage(values[6]);
          fail(403, "Post creation is no longer permitted.");
        }
        return json(res, 201, {
          post: publicPost(await db.prepare(queryPosts + " WHERE p.id=?").get(id)),
        });
      }
      const match = /^\/api\/posts\/([a-zA-Z0-9-]+)$/.exec(route);
      if (match) {
        const post = await db
          .prepare(queryPosts + ` WHERE p.id=? AND ${adminRowScope}`)
          .get(match[1], user.id);
        if (!post) fail(404, "Post not found.");
        if (user.role !== "admin")
          fail(403, "Only administrators can review or manage posts.");
        if (req.method === "GET") return json(res, 200, { post: publicPost(post) });
        if (req.method === "DELETE") {
          const outcomeProofs = (await db.prepare(`SELECT n.proof_image FROM item_outcome_notifications n
            JOIN posts p ON p.id=n.post_id WHERE p.id=? AND n.proof_image IS NOT NULL AND ${adminRowScope}`)
            .all(post.id, user.id)).map((row) => row.proof_image);
          const deleted = await db
            .prepare(`DELETE FROM posts WHERE id=? AND ${adminRowScope}`)
            .run(post.id, user.id);
          if (!deleted.changes)
            fail(403, "Post management is no longer permitted.");
          await cleanupImage(post.image);
          if (postgresMode) await Promise.all(outcomeProofs.map(cleanupImage));
          return json(res, 200, { ok: true });
        }
        if (req.method === "PUT") {
          const input = await authorizedBody(req, "posts.manage", user.id);
          const pendingOutcome = await db.prepare(`SELECT id FROM item_outcome_notifications
            WHERE post_id=? AND reviewed_at IS NULL`).get(post.id);
          if (pendingOutcome)
            fail(409, "Review or dismiss the student's request in Student outcome notifications before editing this post.");
          const values = await postData(input, post, user.id);
          await db.exec("BEGIN IMMEDIATE");
          let outcomeProofs = [];
          try {
            const updated = await db
              .prepare(
                `UPDATE posts SET kind=?,status=?,item_name=?,event_at=?,location=?,description=?,image=?,contact_email=?,contact_phone=?,contact_details=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND ${adminRowScope}`,
              )
              .run(...values, post.id, user.id);
            if (!updated.changes)
              fail(403, "Post management is no longer permitted.");
            if (["Claimed", "Returned"].includes(values[1]))
              outcomeProofs = await resolveOutcomeNotificationsForPost(post.id, user.id);
            await db.exec("COMMIT");
          } catch (error) {
            try { await db.exec("ROLLBACK"); } catch {}
            if (postgresMode && values[6] && values[6] !== post.image)
              await cleanupImage(values[6]);
            throw error;
          }
          if (postgresMode && post.image && values[6] !== post.image)
            await cleanupImage(post.image);
          if (postgresMode) await Promise.all(outcomeProofs.map(cleanupImage));
          return json(res, 200, {
            post: publicPost(await db.prepare(queryPosts + " WHERE p.id=?").get(post.id)),
          });
        }
        if (req.method === "PATCH") {
          const data = await authorizedBody(req, "posts.manage", user.id);
          if (!statuses.includes(data.status)) fail(400, "Invalid status.");
          const pendingOutcome = await db.prepare(`SELECT id FROM item_outcome_notifications
            WHERE post_id=? AND reviewed_at IS NULL`).get(post.id);
          if (pendingOutcome)
            fail(409, "Review or dismiss the student's request in Student outcome notifications before changing this post's status.");
          const kind = ["Lost", "Found"].includes(data.status)
            ? data.status
            : post.kind;
          await db.exec("BEGIN IMMEDIATE");
          let outcomeProofs = [];
          try {
            const updated = await db
              .prepare(
                `UPDATE posts SET kind=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND ${adminRowScope}`,
              )
              .run(kind, data.status, post.id, user.id);
            if (!updated.changes)
              fail(403, "Post management is no longer permitted.");
            if (["Claimed", "Returned"].includes(data.status))
              outcomeProofs = await resolveOutcomeNotificationsForPost(post.id, user.id);
            await db.exec("COMMIT");
          } catch (error) {
            try { await db.exec("ROLLBACK"); } catch {}
            throw error;
          }
          if (postgresMode) await Promise.all(outcomeProofs.map(cleanupImage));
          return json(res, 200, {
            post: publicPost(await db.prepare(queryPosts + " WHERE p.id=?").get(post.id)),
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
      ".svg": "image/svg+xml",
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
}
export function handleRequest(req, res) {
  return typeof db.withRequest === "function"
    ? db.withRequest(() => handleRequestScoped(req, res))
    : handleRequestScoped(req, res);
}
export const server = http.createServer(handleRequest);
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? "This port is already in use. Stop the other server or set a different PORT."
      : error.message,
  );
  process.exitCode = 1;
});
if (process.env.NODE_ENV !== "test" && process.env.VERCEL !== "1")
  server.listen(
    Number(process.env.PORT || 3000),
    process.env.HOST || "127.0.0.1",
    () =>
      console.log(
        `RETURNO running at http://localhost:${server.address().port}`,
      ),
  );
