import test from "node:test";
import assert from "node:assert/strict";

const originalFetch = globalThis.fetch;
const legacyServiceRoleKey = `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.test`;
const env = {
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  secretKey: process.env.SUPABASE_SECRET_KEY,
  bucket: process.env.SUPABASE_STORAGE_BUCKET,
  nodeEnv: process.env.NODE_ENV,
};

test("signed upload grants are scoped to a generated private object path", async () => {
  process.env.SUPABASE_URL = "https://project.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = legacyServiceRoleKey;
  delete process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_STORAGE_BUCKET = "private-images";
  process.env.NODE_ENV = "test";
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify({ url: "/object/upload/sign/private-images/user-id/file.png?token=short-lived" }), { status: 200 });
  };

  try {
    const { createImageUpload } = await import(`../supabase-storage.js?test=${Date.now()}`);
    const ticket = await createImageUpload("user-id", "image/png");
    assert.match(ticket.path, /^user-id\/[a-f0-9-]{36}\.png$/);
    assert.equal(request.url, `https://project.example.test/storage/v1/object/upload/sign/private-images/${ticket.path}`);
    assert.equal(request.options.method, "POST");
    assert.equal(request.options.headers.Authorization, `Bearer ${legacyServiceRoleKey}`);
    assert.match(ticket.uploadUrl, /token=short-lived$/);
    assert.doesNotMatch(ticket.uploadUrl, /test-server-secret|service_role/i);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({
      SUPABASE_URL: env.url,
      SUPABASE_SERVICE_ROLE_KEY: env.key,
      SUPABASE_SECRET_KEY: env.secretKey,
      SUPABASE_STORAGE_BUCKET: env.bucket,
      NODE_ENV: env.nodeEnv,
    })) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

test("Storage failures do not return server credentials or provider response details", async () => {
  process.env.SUPABASE_URL = "https://project.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = legacyServiceRoleKey;
  delete process.env.SUPABASE_SECRET_KEY;
  process.env.NODE_ENV = "test";
  globalThis.fetch = async () => new Response("provider-private-detail", { status: 500 });
  try {
    const { createImageUpload } = await import(`../supabase-storage.js?failure=${Date.now()}`);
    await assert.rejects(() => createImageUpload("user-id", "image/png"), error => {
      assert.match(error.message, /500/);
      assert.doesNotMatch(error.message, /provider-private-detail/);
      assert.doesNotMatch(error.message, new RegExp(legacyServiceRoleKey));
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({
      SUPABASE_URL: env.url,
      SUPABASE_SERVICE_ROLE_KEY: env.key,
      SUPABASE_SECRET_KEY: env.secretKey,
      SUPABASE_STORAGE_BUCKET: env.bucket,
      NODE_ENV: env.nodeEnv,
    })) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

test("Supabase secret API keys use apikey without an invalid bearer JWT", async () => {
  process.env.SUPABASE_URL = "https://project.example.test";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test_value";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_STORAGE_BUCKET = "private-images";
  process.env.NODE_ENV = "test";
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify({ url: "/object/upload/sign/private-images/user-id/file.png?token=short-lived" }), { status: 200 });
  };
  try {
    const { createImageUpload } = await import(`../supabase-storage.js?secret=${Date.now()}`);
    await createImageUpload("user-id", "image/png");
    assert.equal(request.options.headers.apikey, "sb_secret_test_value");
    assert.equal("Authorization" in request.options.headers, false);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({
      SUPABASE_URL: env.url,
      SUPABASE_SERVICE_ROLE_KEY: env.key,
      SUPABASE_SECRET_KEY: env.secretKey,
      SUPABASE_STORAGE_BUCKET: env.bucket,
      NODE_ENV: env.nodeEnv,
    })) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

test("Supabase publishable keys are rejected for privileged Storage operations", async () => {
  process.env.SUPABASE_URL = "https://project.example.test";
  process.env.SUPABASE_SECRET_KEY = "sb_publishable_not-a-server-key";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NODE_ENV = "test";
  let requested = false;
  globalThis.fetch = async () => {
    requested = true;
    return new Response("unexpected", { status: 200 });
  };
  try {
    const { createImageUpload } = await import(`../supabase-storage.js?public=${Date.now()}`);
    await assert.rejects(() => createImageUpload("user-id", "image/png"), /secret key or legacy service-role key/);
    assert.equal(requested, false);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({
      SUPABASE_URL: env.url,
      SUPABASE_SERVICE_ROLE_KEY: env.key,
      SUPABASE_SECRET_KEY: env.secretKey,
      SUPABASE_STORAGE_BUCKET: env.bucket,
      NODE_ENV: env.nodeEnv,
    })) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});
