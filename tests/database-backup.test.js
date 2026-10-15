import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../migrations.js";
import {
  createBackup,
  restoreBackup,
  validateBackup,
} from "../scripts/database.js";

async function withDirectory(work) {
  const directory = await mkdtemp(path.join(tmpdir(), "retorno-db-backup-"));
  try {
    await work(directory);
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}

function createFixture(filename, email) {
  const db = new DatabaseSync(filename);
  try {
    db.exec("PRAGMA journal_mode=WAL");
    migrate(db);
    db.prepare(
      "INSERT INTO users(id,email,full_name,password_hash,role) VALUES(?,?,?,?,?)",
    ).run(email, email, "Backup Test", "fake-test-hash", "student");
    db.prepare(
      "INSERT INTO posts(id,user_id,kind,status,item_name,event_at,location,description,image) VALUES(?,?,?,?,?,?,?,?,?)",
    ).run(
      `post-${email}`,
      email,
      "Lost",
      "Lost",
      "Test keys",
      "2026-10-14T12:00",
      "Library",
      "Synthetic backup fixture",
      "",
    );
  } finally {
    db.close();
  }
}

function emails(filename) {
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    return db
      .prepare("SELECT email FROM users ORDER BY email")
      .all()
      .map((row) => row.email);
  } finally {
    db.close();
  }
}

test("online backup contains a consistent WAL database and refuses overwrite", async () =>
  withDirectory(async (directory) => {
    const source = path.join(directory, "source", "retorno.sqlite");
    const target = path.join(directory, "backups", "safe-copy.sqlite");
    await mkdir(path.dirname(source));
    createFixture(source, "student@backup.example");
    assert.equal(await createBackup(target, { source }), path.resolve(target));
    assert.deepEqual(emails(target), ["student@backup.example"]);
    assert.equal(validateBackup(target), path.resolve(target));
    await assert.rejects(createBackup(target, { source }), /already exists/i);
    await assert.rejects(
      createBackup(source, { source }),
      /live database path/i,
    );
  }));

test("restore requires explicit confirmation and restores validated data", async () =>
  withDirectory(async (directory) => {
    const backup = path.join(directory, "backup.sqlite");
    const destination = path.join(directory, "live", "retorno.sqlite");
    await mkdir(path.dirname(destination));
    createFixture(backup, "restored@backup.example");
    createFixture(destination, "old@backup.example");
    await assert.rejects(restoreBackup(backup, { destination }), /--confirm/);
    assert.deepEqual(emails(destination), ["old@backup.example"]);
    assert.equal(
      await restoreBackup(backup, { destination, confirm: true }),
      path.resolve(destination),
    );
    assert.deepEqual(emails(destination), ["restored@backup.example"]);
  }));

test("verify and restore reject invalid or incomplete backup files without changing live data", async () =>
  withDirectory(async (directory) => {
    const badBackup = path.join(directory, "not-a-db.sqlite");
    const empty = path.join(directory, "empty.sqlite");
    const destination = path.join(directory, "live.sqlite");
    createFixture(destination, "safe@backup.example");
    await writeFile(badBackup, "not a sqlite database");
    await writeFile(empty, "");
    assert.throws(() => validateBackup(empty), /non-empty/);
    assert.throws(() => validateBackup(badBackup));
    await assert.rejects(
      restoreBackup(badBackup, { destination, confirm: true }),
    );
    assert.deepEqual(emails(destination), ["safe@backup.example"]);
  }));
