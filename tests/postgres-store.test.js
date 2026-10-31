import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PostgresStore, toPostgresSql } from "../postgres-store.js";

test("Postgres query conversion keeps placeholders parameterized and rewrites SQLite search/order syntax", () => {
  const sql = toPostgresSql(
    "SELECT * FROM posts p WHERE instr(lower(p.item_name),lower(?))>0 AND p.user_id=? ORDER BY p.rowid ASC",
  );
  assert.equal(
    sql,
    "SELECT * FROM posts p WHERE POSITION(LOWER($1) IN LOWER(p.item_name))>0 AND p.user_id=$2 ORDER BY p.id ASC",
  );
  assert.equal(
    toPostgresSql("INSERT OR IGNORE INTO requests(user_id) VALUES(?)"),
    "INSERT INTO requests(user_id) VALUES($1) ON CONFLICT DO NOTHING",
  );
  assert.equal(
    toPostgresSql("UPDATE posts SET updated_at=CURRENT_TIMESTAMP WHERE id=?"),
    "UPDATE posts SET updated_at=CURRENT_TIMESTAMP::text WHERE id=$1",
  );
});

test("Supabase schema includes current account/report features and blocks browser table access", async () => {
  const sql = await readFile(
    new URL("../migrations/postgres/001-retorno-schema.sql", import.meta.url),
    "utf8",
  );
  for (const table of [
    "users",
    "sessions",
    "posts",
    "pending_registrations",
    "password_resets",
    "account_deletion_requests",
    "policy_acceptances",
    "item_outcome_notifications",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(`));
    assert.match(sql, new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(sql, /REVOKE ALL ON[\s\S]+FROM anon, authenticated/);
  assert.match(sql, /ON DELETE CASCADE/);
});

test("Postgres request transactions use isolated clients and roll back on failure", async () => {
  const clients = [];
  const pool = {
    async connect() {
      const client = {
        statements: [],
        async query(text, values = []) {
          this.statements.push([text, values]);
          return { rows: [], rowCount: 1 };
        },
        release() {
          this.released = true;
        },
      };
      clients.push(client);
      return client;
    },
    async query(text, values = []) {
      return { rows: [{ text, values }], rowCount: 1 };
    },
  };
  const db = new PostgresStore(pool);
  await Promise.all(
    ["first", "second"].map((value) =>
      db.withRequest(async () => {
        await db.exec("BEGIN IMMEDIATE");
        await db.prepare("INSERT INTO sample(value) VALUES(?)").run(value);
        await new Promise((resolve) => setTimeout(resolve, 5));
        await db.exec("COMMIT");
      }),
    ),
  );
  assert.equal(clients.length, 2);
  assert.deepEqual(
    clients.map((client) => client.statements[1][1][0]).sort(),
    ["first", "second"],
  );
  assert.ok(clients.every((client) => client.released));
  assert.ok(clients.every((client) => client.statements.at(-1)[0] === "COMMIT"));

  await assert.rejects(
    db.withRequest(async () => {
      await db.exec("BEGIN");
      throw new Error("rollback test");
    }),
    /rollback test/,
  );
  assert.equal(clients[2].statements.at(-1)[0], "ROLLBACK");
  assert.equal(clients[2].released, true);
});
