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
    const { fileURLToPath } = await import("node:url");
    try { loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url))); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
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
