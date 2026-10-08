(function (root) {
  "use strict";
  const setup =
    "Start the backend with npm start, then open the address printed in the terminal (normally http://localhost:3000).";
  // One origin for pages, API requests and session cookies. Never retry a mutation automatically.
  async function request(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
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
              ? "The server took too long to respond. If you submitted registration, try logging in before registering again."
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
