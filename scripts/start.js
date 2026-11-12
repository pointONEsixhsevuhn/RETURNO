// A single server handles both the UI and API. No separate Live Server process is needed.
if (Number(process.versions.node.split(".")[0]) < 24) {
  console.error(
    "RETURNO requires Node.js 24 or newer. Install it, reopen your terminal, and run npm start.",
  );
  process.exitCode = 1;
} else {
  try {
    // Resolve configuration beside the project, even when launched directly.
    const { loadEnvFile } = await import("node:process");
    const { randomBytes } = await import("node:crypto");
    const { mkdir, readFile, writeFile } = await import("node:fs/promises");
    const { existsSync } = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    try { loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url))); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (
      process.env.DATA_DIR === undefined &&
      process.env.VERCEL !== "1" &&
      process.env.RETURNO_DATABASE !== "postgres"
    ) {
      const recoveredDataDir = fileURLToPath(
        new URL("../data/recovered-accounts/", import.meta.url),
      );
      if (existsSync(path.join(recoveredDataDir, "retorno.sqlite"))) {
        process.env.DATA_DIR = recoveredDataDir;
        console.log("Using the recovered local accounts database.");
      }
    }
    if (process.env.RETURNO_CODE_PEPPER === undefined) {
      const dataDir = process.env.DATA_DIR
        ? path.resolve(process.env.DATA_DIR)
        : fileURLToPath(new URL("../data/", import.meta.url));
      const keyPath = path.join(dataDir, "verification-code.key");
      await mkdir(dataDir, { recursive: true });
      try {
        await writeFile(keyPath, randomBytes(32).toString("hex"), {
          flag: "wx",
          mode: 0o600,
        });
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
      process.env.RETURNO_CODE_PEPPER = (await readFile(keyPath, "utf8")).trim();
      console.log("Created or loaded the local verification key in data/verification-code.key.");
    }
    if (process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "true") {
      throw new Error("Production requires COOKIE_SECURE=true and HTTPS at the hosting layer.");
    }
    const { assertCodePepper } = await import("../verification-codes.js");
    assertCodePepper();
    const { server } = await import("../server.js");
    if (process.env.OPEN_BROWSER === "true") {
      const open = async () => {
        const { spawn } = await import("node:child_process");
        const url = `http://localhost:${server.address().port}/`;
        const child =
          process.platform === "win32"
            ? spawn("cmd.exe", ["/c", "start", "", url], {
                stdio: "ignore",
                windowsHide: true,
              })
            : process.platform === "darwin"
              ? spawn("open", [url], { stdio: "ignore" })
              : spawn("xdg-open", [url], { stdio: "ignore" });
        child.on("error", () =>
          console.log("Open " + url + " in your browser."),
        );
      };
      if (server.listening) open();
      else server.once("listening", open);
    }
  } catch (error) {
    console.error("RETURNO could not start: " + error.message);
    process.exitCode = 1;
  }
}
