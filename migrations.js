import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Published migrations are immutable. Add the next version rather than editing SQL.
export const migrations = [
  {
    version: 1,
    name: "initial-schema",
    sql: readFileSync(
      new URL("./migrations/001-initial-schema.sql", import.meta.url),
      "utf8",
    ),
  },
  {
    version: 2,
    name: "private-claims",
    sql: readFileSync(
      new URL("./migrations/002-private-claims.sql", import.meta.url),
      "utf8",
    ),
  },
  {
    version: 3,
    name: "retire-student-claims",
    sql: readFileSync(
      new URL("./migrations/003-retire-student-claims.sql", import.meta.url),
      "utf8",
    ),
  },
  {
    version: 4,
    name: "email-verification",
    sql: readFileSync(
      new URL("./migrations/004-email-verification.sql", import.meta.url),
      "utf8",
    ),
  },
  { version: 5, name: "password-recovery", sql: readFileSync(new URL("./migrations/005-password-recovery.sql", import.meta.url), "utf8") },
];

export function migrate(db, steps = migrations) {
  for (const [index, step] of steps.entries()) {
    if (
      step.version !== index + 1 ||
      !step.name ||
      typeof step.sql !== "string"
    )
      throw new Error(
        "Migrations must have consecutive versions starting at 1, names and SQL.",
      );
    // Transaction control and connection pragmas belong to the runner, not migration SQL.
    if (
      /\b(BEGIN|END|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|PRAGMA)\b/i.test(step.sql)
    )
      throw new Error(
        `Migration ${step.version} contains transaction control or PRAGMA.`,
      );
  }
  db.exec("PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;");
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const applied = db
      .prepare("SELECT * FROM schema_migrations ORDER BY version")
      .all();
    const checksums = steps.map((step) =>
      createHash("sha256")
        .update(step.sql.replace(/\r\n/g, "\n"))
        .digest("hex"),
    );
    for (const [index, row] of applied.entries()) {
      const step = steps[index];
      if (
        !step ||
        row.version !== step.version ||
        row.name !== step.name ||
        row.checksum !== checksums[index]
      )
        throw new Error(
          "Database migration history differs from this application; refusing startup.",
        );
    }
    for (let index = applied.length; index < steps.length; index++) {
      const step = steps[index];
      db.exec(step.sql);
      db.prepare(
        "INSERT INTO schema_migrations(version,name,checksum) VALUES(?,?,?)",
      ).run(step.version, step.name, checksums[index]);
    }
    if (db.prepare("PRAGMA foreign_key_check").all().length)
      throw new Error(
        "Migration left foreign-key violations; refusing startup.",
      );
    db.exec("COMMIT");
    return steps.length - applied.length;
  } catch (error) {
    // Some SQLite errors already roll back the transaction; preserve the original error.
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  }
}
