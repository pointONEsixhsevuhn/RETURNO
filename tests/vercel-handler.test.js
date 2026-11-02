import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/index.js";

test("Vercel startup failures return safe JSON and a correlatable log ID", async () => {
  const previous = {
    vercel: process.env.VERCEL,
    databaseUrl: process.env.DATABASE_URL,
  };
  process.env.VERCEL = "1";
  delete process.env.DATABASE_URL;

  const headers = {};
  let status;
  let body;
  const response = {
    headersSent: false,
    writeHead(code, values) {
      status = code;
      Object.assign(headers, values);
    },
    end(value) {
      body = value;
    },
  };
  const originalConsoleError = console.error;
  const logged = [];
  console.error = (...values) => logged.push(values);

  try {
    await handler({}, response);
  } finally {
    console.error = originalConsoleError;
    if (previous.vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous.vercel;
    if (previous.databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.databaseUrl;
  }

  assert.equal(status, 503);
  assert.match(headers["Content-Type"], /application\/json/);
  const payload = JSON.parse(body);
  assert.equal(payload.code, "BACKEND_STARTUP_FAILED");
  assert.equal(payload.reason, "DATABASE_URL_MISSING");
  assert.match(payload.incidentId, /^[0-9a-f-]{36}$/i);
  assert.equal(logged.length, 1);
  assert.equal(logged[0][0], "RETURNO function startup/request failure");
  assert.equal(logged[0][1].incidentId, payload.incidentId);
  assert.equal(logged[0][1].code, "DATABASE_URL_MISSING");
  assert.equal(JSON.stringify(logged).includes("DATABASE_URL_MISSING"), true);
});
