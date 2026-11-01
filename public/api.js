(function (root) {
  "use strict";
  const setup =
    "Check your connection and try again. For a local installation, start RETURNO with npm start and open the address printed in the terminal.";
  // One origin for pages, API requests and session cookies. Never retry a mutation automatically.
  async function request(url, options = {}) {
    const controller = new AbortController();
    const method = (options.method || "GET").toUpperCase();
    const isPostMutation =
      (method === "POST" && url === "/posts") ||
      (method === "PUT" && /^\/posts\/[a-zA-Z0-9-]+$/.test(url)) ||
      (method === "POST" &&
        /^\/posts\/[a-zA-Z0-9-]+\/outcome-notifications$/.test(url));
    const timeoutMs = isPostMutation ? 90000 : 15000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response;
      try {
        response = await fetch("/api" + url, {
          credentials: "same-origin",
          ...options,
          signal: controller.signal,
          headers: { "Content-Type": "application/json", ...options.headers },
        });
      } catch (error) {
        throw Object.assign(
          new Error(
            error.name === "AbortError"
              ? url === "/register"
                ? "The server took too long to respond. If you submitted registration, try logging in before registering again."
                : isPostMutation
                  ? "Saving is taking longer than expected. Your post may still have been saved. Check Your posts before trying again."
                  : "The server took too long to respond. Check whether your request completed before trying again."
              : "Cannot connect to the RETURNO server. " + setup,
          ),
          { code: "CONNECTION" },
        );
      }
      if (
        !(response.headers.get("content-type") || "").includes(
          "application/json",
        )
      ) {
        throw Object.assign(
          new Error(
            "This page is not connected to the RETURNO backend. " +
              setup +
              " Do not use Live Server.",
          ),
          { code: "WRONG_SERVER" },
        );
      }
      let data;
      try {
        data = await response.json();
      } catch {
        throw Object.assign(
          new Error(
            "The server returned an incomplete response. Please try again.",
          ),
          { code: "INVALID_RESPONSE" },
        );
      }
      if (!response.ok)
        throw Object.assign(new Error(data.error || "Request failed."), {
          status: response.status,
        });
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }
  root.RetornoAPI = { request };
})(globalThis);
