import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync, backup } from "node:sqlite";
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { migrations } from "../migrations.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function databasePath(
  dataDir = process.env.DATA_DIR || path.join(root, "data"),
) {
  return path.join(path.resolve(dataDir), "retorno.sqlite");
}

function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function validateDatabase(filename) {
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    const result = db.prepare("PRAGMA integrity_check").all();
    if (result.length !== 1 || result[0].integrity_check !== "ok") {
      throw new Error("Database integrity check failed.");
    }
    const foreignKeys = db.prepare("PRAGMA foreign_key_check").all();
    if (foreignKeys.length)
      throw new Error("Database has foreign-key violations.");
    const ledgerExists = db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'",
      )
      .get();
    if (!ledgerExists)
      throw new Error(
        "This file is not a RETURNO database (migration history is missing).",
      );
    const applied = db
      .prepare("SELECT * FROM schema_migrations ORDER BY version")
      .all();
    if (applied.length === 0 || applied.length > migrations.length) {
      throw new Error(
        "Backup migration history does not match this RETURNO version.",
      );
    }
    for (const [index, row] of applied.entries()) {
      const migration = migrations[index];
      const checksum = createHash("sha256")
        .update(migration.sql.replace(/\r\n/g, "\n"))
        .digest("hex");
      if (
        row.version !== migration.version ||
        row.name !== migration.name ||
        row.checksum !== checksum
      ) {
        throw new Error(
          "Backup migration history does not match this RETURNO version.",
        );
      }
    }
  } finally {
    db.close();
  }
}

export async function createBackup(
  destination,
  { source = databasePath() } = {},
) {
  if (!destination) throw new Error("Provide a backup file path.");
  const target = path.resolve(destination);
  const live = path.resolve(source);
  if (samePath(target, live))
    throw new Error("Backup path cannot be the live database path.");
  if (!statSync(source).isFile())
    throw new Error("Live database path must be a file.");
  mkdirSync(path.dirname(target), { recursive: true });
  try {
    statSync(target);
    throw new Error(
      "Backup already exists; choose a new file path to avoid overwriting it.",
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const sourceDb = new DatabaseSync(live, { readOnly: true });
  try {
    try {
      await backup(sourceDb, target);
      validateDatabase(target);
    } catch (error) {
      rmSync(target, { force: true });
      throw error;
    }
  } finally {
    sourceDb.close();
  }
  return target;
}

export function validateBackup(filename) {
  if (!filename) throw new Error("Provide a backup file path.");
  const target = path.resolve(filename);
  const info = statSync(target);
  if (!info.isFile() || info.size === 0)
    throw new Error("Backup must be a non-empty file.");
  validateDatabase(target);
  return target;
}

export async function restoreBackup(
  filename,
  { destination = databasePath(), confirm = false } = {},
) {
  if (!confirm)
    throw new Error(
      "Restore replaces the live database. Re-run with --confirm after reviewing the backup.",
    );
  const source = validateBackup(filename);
  const target = path.resolve(destination);
  if (samePath(source, target))
    throw new Error("Backup path cannot be the live database path.");
  mkdirSync(path.dirname(target), { recursive: true });

  // Validate a copy beside the live DB, then atomically replace it so a bad backup
  // never leaves the app's configured database path partially written.
  const temporary = `${target}.restore-${randomUUID()}.tmp`;
  const sourceDb = new DatabaseSync(source, { readOnly: true });
  try {
    await backup(sourceDb, temporary);
  } finally {
    sourceDb.close();
  }
  try {
    validateDatabase(temporary);
    if (existsSync(target)) {
      try {
        const liveDb = new DatabaseSync(target);
        try {
          const checkpoint = liveDb
            .prepare("PRAGMA wal_checkpoint(TRUNCATE)")
            .get();
          if (checkpoint.busy)
            throw new Error(
              "Could not checkpoint the live database. Stop RETURNO before restoring.",
            );
          liveDb.exec("PRAGMA journal_mode=DELETE");
        } finally {
          liveDb.close();
        }
      } catch (error) {
        if (error.message.includes("Stop RETURNO")) throw error;
        if (![11, 26].includes(error.errcode)) throw error;
      }
    }
    rmSync(`${target}-wal`, { force: true });
    rmSync(`${target}-shm`, { force: true });
    renameSync(temporary, target);
  } catch (error) {
    throw error;
  } finally {
    rmSync(temporary, { force: true });
  }
  return target;
}

async function main(args) {
  const [action, ...rest] = args;
  const confirm = rest.includes("--confirm");
  const positional = rest.filter((arg) => arg !== "--confirm");
  if (action === "backup") {
    const filename = await createBackup(positional[0]);
    console.log(`Verified RETURNO backup created: ${filename}`);
  } else if (action === "verify") {
    const filename = validateBackup(positional[0]);
    console.log(`RETURNO backup is valid: ${filename}`);
  } else if (action === "restore") {
    const filename = await restoreBackup(positional[0], { confirm });
    console.log(
      `RETURNO database restored from ${path.resolve(positional[0])} to ${filename}.`,
    );
    console.log(
      "Restart the RETURNO server and review the restored data before reopening service.",
    );
  } else {
    throw new Error(
      "Usage: node scripts/database.js <backup <file>|verify <file>|restore <file> --confirm>",
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(`Database operation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
