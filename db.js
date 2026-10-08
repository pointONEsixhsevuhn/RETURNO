import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { migrate } from "./migrations.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
export const root = path.dirname(fileURLToPath(import.meta.url));
export const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(root, "data");
mkdirSync(dataDir, { recursive: true });
export const db = new DatabaseSync(path.join(dataDir, "retorno.sqlite"));
db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
try {
  migrate(db);
} catch (error) {
  db.close();
  throw error;
}
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const input = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === input.length && timingSafeEqual(expected, input);
}
export function createUser(email, fullName, password, role = "student") {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO users(id,email,full_name,password_hash,role) VALUES(?,?,?,?,?)",
  ).run(id, email.toLowerCase().trim(), fullName, hashPassword(password), role);
  return id;
}
