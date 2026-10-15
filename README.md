# RETURNO

RETURNO is NVSU's lost-and-found prototype. It uses a vanilla JavaScript browser app, a same-origin Node.js HTTP API, and a local SQLite database. There is no frontend build step; Nodemailer is the runtime npm dependency for SMTP delivery.

The current project status and next tasks are in [docs/PROJECT-ROADMAP.md](docs/PROJECT-ROADMAP.md). The system architecture is in [docs/SYSTEM-DESIGN.md](docs/SYSTEM-DESIGN.md).

## Run locally

1. Install Node.js 24 or newer.
2. In this folder, run `npm install` (or `npm ci` for a clean dependency install).
3. Run `npm start` and open the URL printed in the terminal, normally `http://localhost:3000`.

On Windows, use `npm.cmd start` if PowerShell blocks `npm.ps1`. `start.cmd` is also available. Keep the server terminal open. Do not use VS Code Live Server or open `public/index.html` directly; the backend and UI need the same origin.

The first administrator is created locally with `npm run admin`. Use `npm run admin:reset` to reset an administrator password. An authenticated administrator can register additional admins from the application. Admin-created accounts do not use the student email-verification flow.

Optional demo data is for a fresh database only:

```sh
npm run demo
npm start
```

The demo command refuses to modify a database that already contains users. Its credentials are local test credentials only.

## Current workflows

- Students register with an email verification code, create Lost/Found posts, browse and search the shared authenticated feed, and view their own posts. Students cannot edit, update, or delete reports.
- Administrators manage report details/statuses, search and review registered users, register additional admins, and delete other accounts after email confirmation. Account deletion removes the account's reports and sessions.
- Students may submit or cancel an account-deletion request. An administrator reviews it; submission does not delete the account.
- Administrators manage Claim/Return status processing. Student claims, My claims, and proof-submission workflows are excluded.
- Students can use the emailed password-reset flow. Admin password recovery remains a local CLI operation.
- Search history is kept in current-page browser memory and cleared on logout. Post lists paginate at 28 per page.
- Posts may include PNG, JPEG, or WebP images up to **10 MB**, plus contact details. Images are currently included in paginated post API responses; dimension validation and separate image delivery are not implemented.
- Report event times are entered as campus wall time, PHT (UTC+08:00). They are stored as `YYYY-MM-DDTHH:mm` without server-timezone conversion.

Signup email verification confirms email ownership at registration. It is not a second login factor. Registration's Terms/Privacy acknowledgment is a browser-side required checkbox; versioned acceptance is not stored by the server. See [email verification setup](docs/EMAIL-VERIFICATION.md), [password recovery](docs/PASSWORD-RECOVERY.md), and the current [claim/return decision](docs/CLAIM-RETURN-REQUIREMENTS.md).

## Data and configuration

By default, SQLite data is stored in `data/retorno.sqlite`. The `data/` directory and `.env` are ignored by Git. SMTP and `RETURNO_CODE_PEPPER` settings are documented in `.env.example`; keep real credentials and the 32-byte pepper in local `.env` or a host secret store, separately from SQLite, and never commit them. `npm start` refuses to run without a valid pepper. See [email verification setup](docs/EMAIL-VERIFICATION.md) to generate one.

Supported environment settings include `PORT`, `HOST`, `DATA_DIR`, and `COOKIE_SECURE=true` when HTTPS is provided by the hosting layer. The default host is `127.0.0.1`, suitable for local use. Public hosting still needs a persistent data volume, HTTPS, secure-cookie configuration, proxy-aware abuse controls, monitoring, and a tested recovery plan.

Use the SQLite-aware backup commands below; they include committed WAL data and validate the backup against SQLite integrity, foreign keys, and this app's migration history. Keep backups in a private, access-controlled location because they contain student names, emails, posts, and contact details. The `backups/` folder is ignored by Git.

```powershell
# Create a new backup. Existing backup files are never overwritten.
npm.cmd run db:backup -- "C:\RETURNO-backups\retorno-2026-10-15.sqlite"

# Verify a backup before relying on it.
npm.cmd run db:verify -- "C:\RETURNO-backups\retorno-2026-10-15.sqlite"

# Stop RETURNO, make a fresh backup of the current database, then explicitly restore.
npm.cmd run db:restore -- "C:\RETURNO-backups\retorno-2026-10-15.sqlite" --confirm
```

Restore refuses to run without `--confirm`, rejects invalid or incompatible backups, and validates a staged copy before replacing the configured database file. Stop the server first, retain a separate pre-restore backup, then restart and inspect the restored data. Keep the `RETURNO_CODE_PEPPER` secret available after restore and store it separately from database backups. See [database migrations](docs/DATABASE-MIGRATIONS.md) before changing the schema.

## Project map

| Path | Purpose |
| --- | --- |
| `public/app.js`, `public/styles.css` | UI, hash navigation, interactions, responsive design |
| `public/api.js` | Same-origin JSON requests and connection errors |
| `public/terms.html`, `public/privacy.html` | Public policy documents and compact-menu shell |
| `server.js`, `access-control.js` | HTTP API, validation, authentication, authorization |
| `db.js`, `migrations.js`, `migrations/` | SQLite connection, password hashing, versioned schema |
| `mail.js` | SMTP verification and password emails |
| `scripts/` | Startup, admin setup/recovery, SQLite backup/verify/restore, optional demo data |
| `tests/` | Isolated API, security, CLI, client, navigation, and browser tests |
| `docs/` | Architecture, current roadmap, policy decisions, and security details |
| `AGENTS.md`, `PROJECT_CONTEXT.md`, `docs/agent-workflow/` | Canonical agent policy, confirmed project facts, and supporting workflow guidance |

## Checks

Check that the agent-workflow handoff documents are present and the project context has no unresolved template fields:

```sh
npm run verify:workflow
```

This is a structural documentation check, not an application or security test.

Run the complete isolated API/client/security/CLI suite:

```sh
npm test
```

Run the Chromium browser flows after installing dependencies and Chromium:

```sh
npm ci
npx playwright install chromium
npm run test:e2e -- --trace off
```

On Windows PowerShell, use `npm.cmd` and `npx.cmd`. Playwright runs desktop, mobile, narrow-phone, and tablet projects. The seven-size responsive audit runs in desktop only, so it is intentionally skipped in the other three projects. Automated viewport checks are not physical-device, Safari, or complete accessibility testing. Current counts are maintained in [the roadmap](docs/PROJECT-ROADMAP.md).

GitHub Actions is configured to run both suites on Node 24 with Windows and Linux jobs. Refer to the Actions page for the result of a particular commit; this README does not imply a recent hosted run passed.
