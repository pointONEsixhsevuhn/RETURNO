import { randomUUID } from "node:crypto";

function safeFailureCode(error) {
  const message = error?.message || "";
  if (message.startsWith("RETURNO is not ready for Vercel deployment:"))
    return "POSTGRES_NOT_MARKED_READY";
  if (message.startsWith("RETURNO requires DATABASE_URL"))
    return "DATABASE_URL_MISSING";
  if (message.startsWith("RETURNO_CODE_PEPPER must be"))
    return "CODE_PEPPER_INVALID";
  if (message.startsWith("Set only one of DATABASE_SSL_CA_FILE"))
    return "DATABASE_TLS_CA_CONFLICT";
  if (error?.code === "ERR_UNKNOWN_BUILTIN_MODULE")
    return "NODE_RUNTIME_MISSING_MODULE";
  return error?.code || "UNKNOWN_STARTUP_ERROR";
}

// Load the shared application handler on demand so module initialization errors
// can be reported as JSON instead of Vercel's opaque FUNCTION_INVOCATION_FAILED.
// Never return or log exception messages here: provider errors can contain
// connection details. The error class/code and incident ID are sufficient to
// locate the corresponding runtime failure safely.
export default async function handler(req, res) {
  try {
    const { handleRequest } = await import("../server.js");
    return await handleRequest(req, res);
  } catch (error) {
    const incidentId = randomUUID();
    const failureCode = safeFailureCode(error);
    console.error("RETURNO function startup/request failure", {
      incidentId,
      name: error?.name || "Error",
      code: failureCode,
    });
    if (res.headersSent) return res.end();
    res.writeHead(503, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    return res.end(
      JSON.stringify({
        error: "RETURNO backend could not start.",
        code: "BACKEND_STARTUP_FAILED",
        reason: failureCode,
        incidentId,
      }),
    );
  }
}
