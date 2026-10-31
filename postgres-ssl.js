import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** Build verified TLS settings for node-postgres without permitting insecure mode. */
export function postgresSslOptions(env = process.env) {
  const options = { rejectUnauthorized: true };
  const caFile = env.DATABASE_SSL_CA_FILE?.trim();
  const caValue = env.DATABASE_SSL_CA?.trim();

  if (caFile && caValue) {
    throw new Error("Set only one of DATABASE_SSL_CA_FILE or DATABASE_SSL_CA.");
  }
  if (caFile) {
    const resolvedPath = path.isAbsolute(caFile)
      ? caFile
      : path.resolve(projectRoot, caFile);
    options.ca = readFileSync(resolvedPath, "utf8");
  }
  if (caValue) options.ca = caValue.replaceAll("\\n", "\n");
  return options;
}
