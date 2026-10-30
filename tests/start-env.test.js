import "./test-env.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
test("direct startup loads the project .env regardless of working directory and preserves host overrides", async () => {
 const directory = await mkdtemp(path.join(tmpdir(), "retorno-start-env-"));
 try {
  await mkdir(path.join(directory, "scripts"));
  await writeFile(path.join(directory, "package.json"), '{"type":"module"}');
  await writeFile(path.join(directory, "scripts/start.js"), await readFile(new URL("../scripts/start.js", import.meta.url)));
  await writeFile(path.join(directory, "verification-codes.js"), await readFile(new URL("../verification-codes.js", import.meta.url)));
  await writeFile(path.join(directory, ".env"), "RETORNO_TEST_SETTING=from-local-file\n");
  await writeFile(path.join(directory, "server.js"), 'console.log("SETTING=" + process.env.RETORNO_TEST_SETTING); export const server = {};');
  const env = { ...process.env, OPEN_BROWSER: "false", RETURNO_CODE_PEPPER: "a".repeat(64) };
  delete env.RETORNO_TEST_SETTING;
  const start = () => run(process.execPath, [path.join(directory, "scripts/start.js")], { cwd: tmpdir(), env, windowsHide: true });
  assert.match((await start()).stdout, /SETTING=from-local-file/);
  env.RETORNO_TEST_SETTING = "from-host";
  assert.match((await start()).stdout, /SETTING=from-host/);
  await rm(path.join(directory, ".env"));
  assert.match((await start()).stdout, /SETTING=from-host/);
 } finally { await rm(directory, { recursive: true, force: true }); }
});
test("production startup refuses to run without secure cookies", async () => {
 const directory = await mkdtemp(path.join(tmpdir(), "retorno-production-config-"));
 try {
  await mkdir(path.join(directory, "scripts"));
  await writeFile(path.join(directory, "package.json"), '{"type":"module"}');
  await writeFile(path.join(directory, "scripts/start.js"), await readFile(new URL("../scripts/start.js", import.meta.url)));
  await writeFile(path.join(directory, "verification-codes.js"), await readFile(new URL("../verification-codes.js", import.meta.url)));
  await writeFile(path.join(directory, "server.js"), 'throw new Error("server should not start");');
  const env = { ...process.env, NODE_ENV: "production", COOKIE_SECURE: "false", RETURNO_CODE_PEPPER: "a".repeat(64) };
  await assert.rejects(run(process.execPath, [path.join(directory, "scripts/start.js")], { cwd: tmpdir(), env, windowsHide: true }), /Production requires COOKIE_SECURE=true/);
 } finally { await rm(directory, { recursive: true, force: true }); }
});
test("first start creates and reuses a private verification key in the data directory", async () => {
 const directory = await mkdtemp(path.join(tmpdir(), "retorno-auto-pepper-"));
 try {
  await mkdir(path.join(directory, "scripts"));
  await writeFile(path.join(directory, "package.json"), '{"type":"module"}');
  await writeFile(path.join(directory, "scripts/start.js"), await readFile(new URL("../scripts/start.js", import.meta.url)));
  await writeFile(path.join(directory, "verification-codes.js"), await readFile(new URL("../verification-codes.js", import.meta.url)));
  await writeFile(path.join(directory, "server.js"), 'console.log("PEPPER_VALID=" + /^[a-f0-9]{64}$/.test(process.env.RETURNO_CODE_PEPPER)); export const server = {};');
  const keyPath = path.join(directory, "data", "verification-code.key");
  const env = { ...process.env, OPEN_BROWSER: "false", NODE_ENV: "development" };
  delete env.RETURNO_CODE_PEPPER;
  const start = () => run(process.execPath, [path.join(directory, "scripts/start.js")], { cwd: tmpdir(), env, windowsHide: true });
  const first = await start();
  assert.match(first.stdout, /PEPPER_VALID=true/);
  const firstKey = await readFile(keyPath, "utf8");
  assert.match(firstKey, /^[a-f0-9]{64}$/);
  const second = await start();
  assert.match(second.stdout, /PEPPER_VALID=true/);
  assert.equal(await readFile(keyPath, "utf8"), firstKey);
 } finally { await rm(directory, { recursive: true, force: true }); }
});
