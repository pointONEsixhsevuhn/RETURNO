import "./test-env.js";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let db, server, directory, base, student, otherStudent, admin, postId;
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
  directory = await mkdtemp(path.join(tmpdir(), "retorno-outcome-notifications-"));
  process.env.DATA_DIR = directory;
  process.env.NODE_ENV = "test";
  ({ server } = await import("../server.js"));
  let createUser;
  ({ db, createUser } = await import("../db.js"));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [name, role] of [["owner", "student"], ["other", "student"], ["admin", "admin"]])
    createUser(`${name}@outcomes.example`, name, "OutcomeTest123!", role);
  const signIn = async (name, role = "student") =>
    request("/api/login", "POST", {
      email: `${name}@outcomes.example`, password: "OutcomeTest123!", role,
    });
  student = (await signIn("owner")).cookie;
  otherStudent = (await signIn("other")).cookie;
  admin = (await request("/api/login", "POST", {
    email: "admin@outcomes.example", password: "OutcomeTest123!", role: "admin",
  })).cookie;
  const created = await request("/api/posts", "POST", {
    kind: "Lost", item_name: "Test bag", event_at: "2026-10-08T12:00",
    location: "Library", description: "Synthetic test item", contact_details: "private@example.test",
  }, student);
  postId = created.data.post.id;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  await rm(directory, { recursive: true, force: true });
});

test("students notify admins without changing status; admins set status or dismiss safely", async () => {
  assert.equal((await request(`/api/posts/${postId}/outcome-notifications`, "POST", { outcome: "Returned", extra: "no" }, student)).status, 400);
  assert.equal((await request(`/api/posts/${postId}/outcome-notifications`, "POST", { outcome: "Returned" }, otherStudent)).status, 404);
  assert.equal((await request(`/api/posts/${postId}/outcome-notifications`, "POST", { outcome: "Lost" }, student)).status, 400);
  const notified = await request(`/api/posts/${postId}/outcome-notifications`, "POST", { outcome: "Returned" }, student);
  assert.equal(notified.status, 201);
  assert.equal((await request(`/api/posts/${postId}`, "PATCH", { status: "Returned" }, student)).status, 403);

  const ownPosts = await request("/api/posts?mine=1", "GET", undefined, student);
  assert.equal(ownPosts.data.posts[0].status, "Lost");
  assert.equal(ownPosts.data.posts[0].pending_outcome, "Returned");
  assert.equal((await request(`/api/posts/${postId}/outcome-notifications`, "POST", { outcome: "Claimed" }, student)).status, 409);
  assert.equal((await request("/api/item-outcome-notifications", "GET", undefined, student)).status, 403);
  assert.equal((await request("/api/item-outcome-notifications", "GET", undefined, admin)).status, 200);
  const inbox = await request("/api/item-outcome-notifications", "GET", undefined, admin);
  const notification = inbox.data.notifications[0];
  assert.equal(notification.outcome, "Returned");
  assert.equal(notification.student_name, "owner");
  assert.equal("contact_details" in notification, false);
  assert.equal((await request(`/api/item-outcome-notifications/${notification.id}`, "PATCH", { status: "Returned" }, student)).status, 403);
  assert.equal((await request(`/api/item-outcome-notifications/${notification.id}`, "PATCH", { status: "Lost" }, admin)).status, 400);

  db.exec(`CREATE TRIGGER fail_outcome_review BEFORE UPDATE OF reviewed_at ON item_outcome_notifications
    BEGIN SELECT RAISE(ABORT,'synthetic review failure'); END`);
  assert.equal((await request(`/api/item-outcome-notifications/${notification.id}`, "PATCH", { status: "Returned" }, admin)).status, 500);
  assert.equal((await request(`/api/posts/${postId}`, "GET", undefined, admin)).data.post.status, "Lost");
  assert.equal((await request("/api/posts?mine=1", "GET", undefined, student)).data.posts[0].pending_outcome, "Returned");
  db.exec("DROP TRIGGER fail_outcome_review");

  const reviewed = await request(`/api/item-outcome-notifications/${notification.id}`, "PATCH", { status: "Returned" }, admin);
  assert.equal(reviewed.status, 200);
  const saved = await request(`/api/posts/${postId}`, "GET", undefined, admin);
  assert.equal(saved.data.post.status, "Returned");
  assert.equal((await request("/api/posts?mine=1", "GET", undefined, student)).data.posts[0].pending_outcome, null);
  assert.equal((await request(`/api/item-outcome-notifications/${notification.id}`, "PATCH", { status: "Claimed" }, admin)).status, 404);
});

test("administrators can dismiss without changing a report and pending entries cascade on delete", async () => {
  const created = await request("/api/posts", "POST", {
    kind: "Found", item_name: "Test keys", event_at: "2026-10-08T12:00",
    location: "Hall", description: "Synthetic test keys",
  }, student);
  const id = created.data.post.id;
  const submitted = await request(`/api/posts/${id}/outcome-notifications`, "POST", { outcome: "Claimed" }, student);
  assert.equal(submitted.status, 201);
  const entry = (await request("/api/item-outcome-notifications", "GET", undefined, admin)).data.notifications.find((item) => item.post_id === id);
  assert.ok(entry);
  assert.equal((await request(`/api/item-outcome-notifications/${entry.id}`, "PATCH", { status: "Dismissed" }, admin)).status, 200);
  assert.equal((await request(`/api/posts/${id}`, "GET", undefined, admin)).data.post.status, "Found");
  assert.equal((await request(`/api/posts/${id}`, "DELETE", undefined, admin)).status, 200);
  assert.equal(db.prepare("SELECT id FROM item_outcome_notifications WHERE id=?").get(entry.id), undefined);
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
});

test("the existing administrator status control also resolves a pending notification atomically", async () => {
  const created = await request("/api/posts", "POST", {
    kind: "Lost", item_name: "Test jacket", event_at: "2026-10-08T12:00",
    location: "Gym", description: "Synthetic test jacket",
  }, student);
  const id = created.data.post.id;
  assert.equal((await request(`/api/posts/${id}/outcome-notifications`, "POST", { outcome: "Returned" }, student)).status, 201);
  assert.equal((await request(`/api/posts/${id}`, "PATCH", { status: "Returned" }, admin)).status, 200);
  const ownPosts = await request("/api/posts?mine=1", "GET", undefined, student);
  assert.equal(ownPosts.data.posts.find((post) => post.id === id).status, "Returned");
  assert.equal(ownPosts.data.posts.find((post) => post.id === id).pending_outcome, null);
  assert.equal((await request("/api/item-outcome-notifications", "GET", undefined, admin)).data.notifications.some((item) => item.post_id === id), false);
});
