import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate, migrations as allMigrations } from "../migrations.js";

const migrations = allMigrations.slice(0, 1);
const legacySql = readFileSync(
  new URL("../schema.sql", import.meta.url),
  "utf8",
);
function isolated(work) {
  const directory = mkdtempSync(path.join(tmpdir(), "retorno-migration-"));
  const filename = path.join(directory, "test.sqlite");
  let db = new DatabaseSync(filename);
  const reopen = () => {
    db.close();
    db = new DatabaseSync(filename);
    return db;
  };
  try {
    work(db, reopen);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
function seed(db) {
  db.exec(legacySql);
  db.exec(`INSERT INTO users(id,email,full_name,password_hash,role) VALUES
    ('student','student@migration.example','Student','fake-test-hash','student'),
    ('admin','admin@migration.example','Admin','fake-admin-hash','admin');
    INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('fake-token','student',9999999999);
    INSERT INTO posts(id,user_id,kind,status,item_name,event_at,location,description,image) VALUES
    ('lost','student','Lost','Lost','Wallet','2026-10-08T12:00','Gate','Test',''),
    ('claimed','student','Found','Claimed','Keys','2026-10-08T12:00','Gate','Legacy',''),
    ('returned','admin','Found','Returned','Book','2026-10-08T12:00','Gate','Legacy','');`);
}
const snapshot = (db) =>
  Object.fromEntries(
    ["users", "sessions", "posts"].map((table) => [
      table,
      db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all(),
    ]),
  );
const ledger = (db) =>
  db.prepare("SELECT * FROM schema_migrations ORDER BY version").all();

test("claim retirement preserves stored evidence and restores administrator deletion", () =>
  isolated((db, reopen) => {
    seed(db);
    migrate(db, migrations);
    const before = snapshot(db);
    assert.equal(migrate(db, allMigrations.slice(0, 2)), 1);
    assert.deepEqual(snapshot(db), before);
    assert.equal(db.prepare("SELECT count(*) n FROM claims").get().n, 0);
    db.prepare(
      "INSERT INTO claims(id,post_id,claimant_id,evidence) VALUES(?,?,?,?)",
    ).run(
      "test-claim",
      "claimed",
      "admin",
      "Test private evidence for persistence",
    );
    db = reopen();
    assert.equal(migrate(db), 1);
    assert.equal(
      db
        .prepare(
          "SELECT evidence FROM retired_student_claims WHERE id='test-claim'",
        )
        .get().evidence,
      "Test private evidence for persistence",
    );
    assert.equal(migrate(db), 0);
    assert.deepEqual(snapshot(db), before);
    db.prepare("DELETE FROM posts WHERE id='claimed'").run();
    assert.equal(db.prepare("SELECT count(*) n FROM retired_student_claims").get().n, 1);
  }));

test("fresh migrations create the schema and run once across database reopen", () =>
  isolated((db, reopen) => {
    assert.equal(migrate(db, migrations), 1);
    assert.equal(ledger(db).length, 1);
    assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    db = reopen();
    const before = ledger(db);
    assert.equal(migrate(db, migrations), 0);
    assert.deepEqual(ledger(db), before);
    assert.equal(
      db.prepare("PRAGMA integrity_check").get().integrity_check,
      "ok",
    );
  }));

test("legacy enrollment preserves users sessions and active/claimed/returned reports", () =>
  isolated((db, reopen) => {
    seed(db);
    const before = snapshot(db);
    assert.equal(migrate(db, migrations), 1);
    assert.deepEqual(snapshot(db), before);
    db = reopen();
    assert.equal(migrate(db, migrations), 0);
    assert.deepEqual(snapshot(db), before);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  }));

test("failed pending batch rolls back schema data and version records then permits retry", () =>
  isolated((db) => {
    seed(db);
    migrate(db, migrations);
    const before = snapshot(db),
      history = ledger(db);
    const addition = {
      version: 2,
      name: "test-column",
      sql: "ALTER TABLE posts ADD COLUMN test_note TEXT; UPDATE posts SET description='changed';",
    };
    assert.throws(
      () =>
        migrate(db, [
          ...migrations,
          addition,
          {
            version: 3,
            name: "broken",
            sql: "INSERT INTO missing_table VALUES(1);",
          },
        ]),
      /missing_table/,
    );
    assert.deepEqual(snapshot(db), before);
    assert.deepEqual(ledger(db), history);
    assert.ok(
      !db
        .prepare("PRAGMA table_info(posts)")
        .all()
        .some((column) => column.name === "test_note"),
    );
    assert.equal(migrate(db, [...migrations, addition]), 1);
    assert.equal(ledger(db).length, 2);
  }));

test("failed first enrollment leaves legacy records and no migration ledger", () =>
  isolated((db) => {
    seed(db);
    const before = snapshot(db);
    assert.throws(
      () =>
        migrate(db, [
          ...migrations,
          { version: 2, name: "broken", sql: "SELECT * FROM missing_table;" },
        ]),
      /missing_table/,
    );
    assert.deepEqual(snapshot(db), before);
    assert.equal(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE name='schema_migrations'",
        )
        .get(),
      undefined,
    );
    assert.equal(migrate(db, migrations), 1);
  }));

test("changed missing and newer migration histories refuse writes", () =>
  isolated((db) => {
    seed(db);
    migrate(db, migrations);
    const before = snapshot(db),
      history = ledger(db);
    assert.throws(
      () =>
        migrate(db, [
          { ...migrations[0], sql: migrations[0].sql + "\n-- changed" },
        ]),
      /history differs/,
    );
    assert.throws(() => migrate(db, []), /history differs/);
    db.prepare("UPDATE schema_migrations SET version=2").run();
    assert.throws(() => migrate(db, migrations), /history differs/);
    assert.deepEqual(snapshot(db), before);
    db.prepare("UPDATE schema_migrations SET version=1").run();
    assert.deepEqual(ledger(db), history);
  }));

test("invalid migration definitions are refused before modifying a database", () =>
  isolated((db) => {
    for (const steps of [
      [{ version: 2, name: "gap", sql: "SELECT 1" }],
      [{ version: 1, name: "control", sql: "COMMIT;" }],
    ])
      assert.throws(
        () => migrate(db, steps),
        /Migrations must|transaction control/,
      );
    assert.equal(db.prepare("SELECT name FROM sqlite_master").all().length, 0);
  }));

test("foreign-key violations refuse legacy enrollment without changing records", () =>
  isolated((db) => {
    seed(db);
    db.exec("PRAGMA foreign_keys=OFF; UPDATE sessions SET user_id='missing';");
    const before = snapshot(db);
    assert.throws(() => migrate(db, migrations), /foreign-key violations/);
    assert.deepEqual(snapshot(db), before);
    assert.equal(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE name='schema_migrations'",
        )
        .get(),
      undefined,
    );
  }));

test("migration checksums tolerate Windows and Linux line endings", () =>
  isolated((db) => {
    migrate(db, migrations);
    assert.equal(
      migrate(
        db,
        migrations.map((step) => ({
          ...step,
          sql: step.sql.replace(/\r?\n/g, "\r\n"),
        })),
      ),
      0,
    );
  }));
