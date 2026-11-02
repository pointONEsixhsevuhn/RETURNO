import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.NODE_ENV = "test";

test("Vercel function exports the shared request handler", async () => {
  const { default: handler } = await import("../api/index.js");
  assert.equal(typeof handler, "function");
});

test("Vercel refuses to initialize without persistent Postgres configuration", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "retorno-vercel-"));
  try {
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", "await import('./db.js')"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          VERCEL: "1",
          DATABASE_URL: "",
          DATA_DIR: directory,
        },
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires DATABASE_URL.*SQLite/s);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
