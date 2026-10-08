# Database migrations

Startup now calls `migrate()` from `migrations.js` before serving requests. Fresh databases and existing unversioned databases enroll through version 1, the existing additive `CREATE TABLE/INDEX IF NOT EXISTS` schema. Enrollment preserves users, password hashes, sessions, report fields and legacy statuses. It does not infer verified claims or handovers.

`schema_migrations` records version, name, SHA-256 SQL checksum and server application timestamp. SQL checksums normalize CRLF to LF so a database can move between Windows and Linux. Published migration files and names are immutable. `schema.sql` remains a reference for the original schema, not the startup migration source.

## Adding a migration

1. Add the next numbered SQL file under `migrations/` and append its version, name and loaded SQL to the ordered `migrations` export. Versions start at 1 and must be consecutive.
2. Keep connection PRAGMAs and transaction control out of migration SQL; the runner owns them. The current guard conservatively rejects those keywords anywhere, including comments, strings and trigger bodies. Extend that guard deliberately with tests if a future migration needs triggers.
3. Test fresh creation, upgrade from the published baseline, data preservation, repeat startup, failure rollback and restart using disposable databases. Do not change prior migration SQL to repair a deployed database; add a new migration.
4. Before a production schema upgrade, create and verify a SQLite-aware backup. Backup/restore tooling remains a separate task; rollback on migration failure is not a substitute for a backup or a downgrade procedure.

## Atomic upgrade and failures

The runner enables foreign keys and takes a `BEGIN IMMEDIATE` write transaction before inspecting history. It checks that recorded migrations match an exact prefix of this application's migrations, executes all pending migrations, records their versions and checks foreign-key integrity before committing. SQLite's immediate transaction acquires the write transaction at the beginning; another writer may cause a busy error. See [SQLite transaction documentation](https://www.sqlite.org/lang_transaction.html).

All pending versions form one transaction. A failed statement or integrity/history check rolls back that batch, including ledger creation on first enrollment; previously committed migrations remain. Startup closes the database and reports the error instead of serving with an incomplete upgrade. Missing, changed, nonconsecutive or newer recorded history refuses startup; this application does not automatically downgrade a newer database.

The existing connection uses WAL and a five-second busy timeout. Migration tests cover fresh/reopened databases, seeded legacy records, schema/data/history rollback, retry after failure, history mismatch, definition validation, foreign-key violations and cross-platform line endings. They do not establish power-loss recovery, compatibility with arbitrary hand-modified schemas, or backup restoration.
