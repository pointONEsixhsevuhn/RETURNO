import { setMailTransport } from "../../mail.js";
export const verificationCodes = new Map();
import { test as base, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const test = base.extend({
  testServer: [
    async ({}, use) => {
      // Each worker owns a new database and an ephemeral localhost port.
      // Never attach to a running user server or inherit its DATA_DIR.
      const directory = await mkdtemp(path.join(tmpdir(), "retorno-e2e-"));
      process.env.DATA_DIR = directory;
      process.env.NODE_ENV = "test";
      setMailTransport({
        async sendMail(message) {
          const match = message.text.match(/code is (\d{6})/);
          if (match) verificationCodes.set(message.to, match[1]);
          return {};
        },
      });
      const { server } = await import("../../server.js");
      const { db, createUser } = await import("../../db.js");
      try {
        createUser(
          "admin@e2e.example",
          "Browser Test Admin",
          "BrowserAdmin123!",
          "admin",
        );
        await new Promise((resolve, reject) => {
          server.once("error", reject);
          server.listen(0, "127.0.0.1", resolve);
        });
        await use(`http://127.0.0.1:${server.address().port}`);
      } finally {
        if (server.listening) {
          server.closeAllConnections();
          await new Promise((resolve) => server.close(resolve));
        }
        db.close();
        const resolved = path.resolve(directory);
        if (
          !resolved.startsWith(path.resolve(tmpdir()) + path.sep) ||
          !path.basename(resolved).startsWith("retorno-e2e-")
        )
          throw new Error(
            "Refusing to remove a directory outside the E2E temp directory.",
          );
        await rm(resolved, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 200,
        });
      }
    },
    { scope: "worker" },
  ],
  baseURL: async ({ testServer }, use) => {
    await use(testServer);
  },
  pageErrors: [
    async ({ page }, use) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await use(errors);
      expect(errors, "No uncaught browser JavaScript errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
