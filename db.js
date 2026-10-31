import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { migrate } from "./migrations.js";
import pg from "pg";
import { PostgresStore } from "./postgres-store.js";
import { postgresSslOptions } from "./postgres-ssl.js";
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
const usePostgres =
  process.env.VERCEL === "1" || process.env.RETURNO_DATABASE === "postgres";
if (
  process.env.VERCEL === "1" &&
  process.env.RETURNO_POSTGRES_READY !== "true"
) {
  throw new Error(
    "RETURNO is not ready for Vercel deployment: the Supabase Postgres migration is incomplete. SQLite is local and non-persistent on Vercel.",
  );
}
if (usePostgres && !process.env.DATABASE_URL) {
  throw new Error(
    "RETURNO requires DATABASE_URL for Vercel or Postgres mode. SQLite is local and non-persistent on Vercel.",
  );
}
export const db = usePostgres
  ? new PostgresStore(
      new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        max: 1,
        ssl: postgresSslOptions(),
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 10000,
        statement_timeout: 10000,
      }),
    )
  : (() => {
      mkdirSync(dataDir, { recursive: true });
      const sqlite = new DatabaseSync(path.join(dataDir, "retorno.sqlite"));
      sqlite.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
      try {
        migrate(sqlite);
      } catch (error) {
        sqlite.close();
        throw error;
      }
      return sqlite;
    })();
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
  if (usePostgres) {
    return db
      .prepare(
        "INSERT INTO users(id,email,full_name,password_hash,role) VALUES(?,?,?,?,?)",
      )
      .run(id, email.toLowerCase().trim(), fullName, hashPassword(password), role)
      .then(() => id);
  }
  db.prepare(
    "INSERT INTO users(id,email,full_name,password_hash,role) VALUES(?,?,?,?,?)",
  ).run(id, email.toLowerCase().trim(), fullName, hashPassword(password), role);
  return id;
}

export async function withDatabaseTransaction(callback) {
  if (usePostgres) {
    return db.withRequest(async () => {
      await db.exec("BEGIN");
      try {
        const result = await callback();
        await db.exec("COMMIT");
        return result;
      } catch (error) {
        try {
          await db.exec("ROLLBACK");
        } catch {}
        throw error;
      }
    });
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    const result = await callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  }
}
