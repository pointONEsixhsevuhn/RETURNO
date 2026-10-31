import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createImageUpload, deleteImage, downloadImage } from "../supabase-storage.js";

process.env.NODE_ENV = "test";
process.env.RETURNO_DATABASE = "postgres";
delete process.env.VERCEL;
process.env.RETURNO_CODE_PEPPER ||= randomBytes(32).toString("hex");

const { server } = await import("../server.js");
const { db, createUser } = await import("../db.js");
const runId = randomUUID();
const studentEmail = `smoke-student-${runId}@example.test`;
const adminEmail = `smoke-admin-${runId}@example.test`;
const password = `Smoke-${randomBytes(18).toString("hex")}!`;
let studentId, adminId, proofPath, base;
let stage = "initialization";

async function request(route, method = "GET", data, cookie) {
  const response = await fetch(base + route, {
    method,
    headers: {
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const body = await response.json().catch(() => ({}));
  return { response, body, cookie: response.headers.get("set-cookie")?.split(";")[0] };
}

function expectStatus(result, status, operation) {
  if (result.response.status !== status)
    throw new Error(`${operation} returned HTTP ${result.response.status}; expected ${status}.`);
  return result.body;
}

try {
  stage = "create synthetic accounts";
  studentId = await createUser(studentEmail, "Synthetic Smoke Student", password, "student");
  adminId = await createUser(adminEmail, "Synthetic Smoke Admin", password, "admin");
  stage = "start local API";
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  stage = "student login";
  const studentLoginResult = await request("/api/login", "POST", {
    email: studentEmail, password, role: "student",
  });
  expectStatus(studentLoginResult, 200, "Student login");
  stage = "administrator login";
  const adminLoginResult = await request("/api/login", "POST", {
    email: adminEmail, password, role: "admin",
  });
  expectStatus(adminLoginResult, 200, "Admin login");
  const studentCookie = studentLoginResult.cookie;
  const adminCookie = adminLoginResult.cookie;
  if (!studentCookie || !adminCookie) throw new Error("Login did not establish test sessions.");

  stage = "create synthetic report";
  const post = expectStatus(await request("/api/posts", "POST", {
    kind: "Lost",
    item_name: "Synthetic smoke test item",
    event_at: "2026-10-31T12:00",
    location: "Synthetic test location",
    description: "Temporary deployment verification record.",
  }, studentCookie), 201, "Create synthetic report").post;

  stage = "request proof upload ticket";
  const bytes = await readFile(new URL("../public/assets/wallet.png", import.meta.url));
  const ticket = expectStatus(await request(
    `/api/posts/${encodeURIComponent(post.id)}/outcome-notifications/proof-upload-ticket`,
    "POST",
    { contentType: "image/png", size: bytes.length },
    studentCookie,
  ), 201, "Create proof upload ticket");
  stage = "upload synthetic proof to Storage";
  proofPath = ticket.path;
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", new Blob([bytes], { type: "image/png" }), "synthetic-proof.png");
  const upload = await fetch(ticket.uploadUrl, {
    method: "PUT",
    headers: { "x-upsert": "false" },
    body: form,
  });
  if (!upload.ok) throw new Error(`Supabase proof upload returned HTTP ${upload.status}.`);

  stage = "submit proof notification";
  const submitted = expectStatus(await request(
    `/api/posts/${encodeURIComponent(post.id)}/outcome-notifications`,
    "POST", { imageKey: proofPath }, studentCookie,
  ), 201, "Submit proof notification").notification;
  if (submitted.outcome !== "Claimed") throw new Error("Lost report did not derive Claimed.");

  stage = "verify administrator inbox and proof permissions";
  const inbox = expectStatus(await request("/api/item-outcome-notifications", "GET", undefined, adminCookie), 200, "Read admin inbox");
  const notification = inbox.notifications.find((item) => item.id === submitted.id);
  if (!notification?.has_proof || notification.outcome !== "Claimed")
    throw new Error("Admin inbox did not receive the private proof notification.");

  const deniedProof = await request(`/api/item-outcome-notifications/${notification.id}/proof`, "GET", undefined, studentCookie);
  if (deniedProof.response.status !== 403) throw new Error("Student could access administrator-only proof.");
  const visibleProof = await fetch(`${base}/api/item-outcome-notifications/${notification.id}/proof`, {
    headers: { Cookie: adminCookie },
  });
  if (!visibleProof.ok || visibleProof.headers.get("content-type") !== "image/png")
    throw new Error("Admin could not load the uploaded proof image.");

  stage = "administrator approval and Storage cleanup";
  expectStatus(await request(`/api/item-outcome-notifications/${notification.id}`, "PATCH", {
    status: "Claimed",
  }, adminCookie), 200, "Admin approval");
  const savedPost = expectStatus(await request(`/api/posts/${post.id}`, "GET", undefined, adminCookie), 200, "Read reviewed report").post;
  if (savedPost.status !== "Claimed") throw new Error("Admin approval did not update report status.");
  let proofStillExists = false;
  try {
    await downloadImage(proofPath);
    proofStillExists = true;
  } catch (error) {
    // Supabase Storage responds with HTTP 400 for a missing object.
    if (![400, 404].includes(error.status)) throw error;
  }
  if (proofStillExists)
    throw new Error("Reviewed proof image was not removed from private Storage.");

  console.log("Supabase synthetic login, report, private proof, admin review and Storage cleanup: PASS");
  console.log("No email was sent; only the synthetic records created by this check were used.");
} catch (error) {
  console.error(`Smoke check failed during ${stage}: ${error.message || "unexpected error"}`);
  process.exitCode = 1;
} finally {
  if (proofPath) {
    try { await deleteImage(proofPath); } catch {}
  }
  if (studentId || adminId) {
    try {
      await db.prepare("DELETE FROM users WHERE id IN (?,?)").run(studentId || "", adminId || "");
    } catch {
      console.error("Synthetic account cleanup failed. Remove the smoke-check accounts from Supabase before deployment.");
      process.exitCode = 1;
    }
  }
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  await db.close();
}
