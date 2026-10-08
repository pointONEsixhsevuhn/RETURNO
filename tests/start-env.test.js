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
  await writeFile(path.join(directory, ".env"), "RETORNO_TEST_SETTING=from-local-file\n");
  await writeFile(path.join(directory, "server.js"), 'console.log("SETTING=" + process.env.RETORNO_TEST_SETTING); export const server = {};');
  const env = { ...process.env, OPEN_BROWSER: "false" };
  delete env.RETORNO_TEST_SETTING;
  const start = () => run(process.execPath, [path.join(directory, "scripts/start.js")], { cwd: tmpdir(), env, windowsHide: true });
  assert.match((await start()).stdout, /SETTING=from-local-file/);
  env.RETORNO_TEST_SETTING = "from-host";
  assert.match((await start()).stdout, /SETTING=from-host/);
  await rm(path.join(directory, ".env"));
  assert.match((await start()).stdout, /SETTING=from-host/);
 } finally { await rm(directory, { recursive: true, force: true }); }
});
