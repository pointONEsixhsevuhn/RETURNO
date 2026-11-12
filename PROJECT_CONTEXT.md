# RETURNO project context

This is a factual index for agents and contributors. `AGENTS.md` is the canonical policy; use linked documents for details rather than duplicating mutable implementation facts.

## Product and users

- **Product:** NVSU RETURNO, a campus lost-and-found system for reporting and finding belongings.
- **Primary users:** Students create and browse/search reports; administrators manage reports, account requests, and other accounts.
- **Main outcomes:** Publish a Lost/Found report, find matching reports, contact the poster, and let administrators manage return statuses.
- **Out of scope:** Student claim submission, My claims, student proof-of-ownership forms/APIs, and student post editing/status/deletion. Students may send an outcome notification for their own active report with a required private handover image visible only to admins while pending. The server derives Claimed for Lost and Returned for Found; administrators manage claim/return processing and evidence review.
- **Product decisions:** See [claim and return requirements](docs/CLAIM-RETURN-REQUIREMENTS.md) and the rules in `AGENTS.md`.

## Repository and architecture

- **Stack:** Node.js 24 or newer, npm, browser-native HTML/CSS/JavaScript, Node HTTP server, SQLite via `node:sqlite` for local/test use, and a partial optional PostgreSQL adapter for the Vercel migration.
- **Package manager:** npm; `package-lock.json` is committed.
- **Entry points:** `scripts/start.js` starts the service; `server.js` implements the HTTP/API layer; `public/index.html` and `public/app.js` implement the SPA; `public/terms.html` and `public/privacy.html` are standalone policy documents.
- **Deployment preparation:** `Dockerfile`, `compose.yaml`, and `Caddyfile` package the existing Node/SQLite app with a persistent database volume and HTTPS reverse proxy for a single Linux host. No single-host deployment through this Compose/Caddy path has been verified. See [deployment instructions](docs/DEPLOYMENT.md).
- **Vercel migration:** The user selected Vercel with Supabase Postgres and Storage and has reported deploying it. `api/index.js`, `vercel.json`, `postgres-store.js`, and `migrations/postgres/` provide the Vercel request boundary and async Postgres implementation. Postgres mode supports direct private image uploads and authenticated same-origin image delivery, bounded shared sensitive-request limiting, and shared email resend reservations. Previous disposable-project checks passed for TLS/schema/bucket, synthetic student/admin report flows, report image operations, outcome-proof review/cleanup, and localhost CORS. Production-origin CORS, actual signup-email delivery, concurrency behavior, and deployment configuration remain unverified. During the 2026-11-12 handoff audit, `npm.cmd run vercel:check` stopped at local `RETURNO_CODE_PEPPER` validation before provider checks; this local preflight cannot inspect Vercel settings. The current production URL and `/api/health` were not verified in that audit. Vercel automatically selects Postgres and fails closed if `DATABASE_URL` is absent; the old manual readiness toggle has been removed. See [Vercel deployment status](docs/VERCEL-DEPLOYMENT.md). Functions are pinned to Singapore to match the recommended Supabase region for Philippine testers, and password reset/change email tasks use Vercel's background-task lifecycle.
- **Temporary sharing:** Windows users can run `share-cloudflare.cmd` to expose the existing local server through a temporary Cloudflare Quick Tunnel. This is not a persistent deployment; details and privacy cautions are in [Cloudflare Quick Tunnel testing](docs/CLOUDFLARE-QUICK-TUNNEL.md).
- **Architecture:** Same-origin browser and API, local SQLite for development/tests, and an incomplete optional Postgres adapter for the selected Vercel route. Authorization and row scoping are enforced in application code; SQLite native RLS is not used. See [system design](docs/SYSTEM-DESIGN.md), [access control](docs/ACCESS-CONTROL.md), and [Vercel migration status](docs/VERCEL-DEPLOYMENT.md).
- **Brand and UI:** `public/styles.css`, `public/assets/`, brown/white RETURNO theme; keep status badges at the upper-right of post cards.
- **Data migrations:** Numbered, immutable SQL migrations in `migrations/`; read [migration procedure](docs/DATABASE-MIGRATIONS.md) before schema work.
- **Database recovery:** `npm run db:backup`, `npm run db:verify`, and `npm run db:restore` use SQLite's online backup API and validate integrity, foreign keys, and migration history. Stop the server before restore; backups contain personal data and must be stored privately outside the repo.

## Constraints, sensitive data, and ownership

- Student/admin separation and the exclusion of student claims are product constraints. Do not broaden permissions without an explicit product decision.
- Student signup and password recovery use emailed codes. Signup email confirmation is not a second authentication factor. Registration requires policy acknowledgment in both UI and API and stores accepted Terms/Privacy versions and time after successful email verification. Admin recovery is a local CLI workflow.
- Post contact information is displayed with the report. Report event time is campus wall time (PHT, UTC+08:00).
- Secrets: `.env`, SMTP credentials, `RETURNO_CODE_PEPPER` (or local `data/verification-code.key`), session tokens, passwords, and verification/reset codes. Do not print or commit them; keep the code pepper out of SQLite backups.
- Personal data: SQLite records include account emails/names, reports, and contact information. Use isolated temporary databases and synthetic records in tests.
- The user is the product decision owner. Preserve existing scope; seek a decision when an unresolved product or destructive-data choice is required. Follow `AGENTS.md` for commit/push authorization and workflow.

## Verification

| Check | Command | Purpose and scope |
| --- | --- | --- |
| Workflow scaffolding | `npm.cmd run verify:workflow` | Required handoff docs exist and context has no template markers; structural check only. |
| Unit/API/security/CLI/database backup | `npm.cmd test` | Isolated temporary databases; no live account data. |
| Browser flows | `npm.cmd run test:e2e -- --trace off` | Isolated server/database; desktop, mobile, 320px phone, and tablet Chromium projects. |
| Dependency advisory check | `npm.cmd audit --omit=dev` | Reads npm advisory service; requires network and can change over time. |
| Diff whitespace | `git diff --check` | Check current unstaged/staged changes for whitespace errors. |

- **Runtime:** Node.js 24+; tested locally on Node.js 24.21.0 Windows (see current roadmap for latest evidence).
- **CI:** `.github/workflows/ci.yml`, Node 24 on Windows and Linux. Verify the hosted Actions run separately; local tests do not prove CI passed.
- **Known limits:** No verified public deployment, physical-device run, live SMTP inbox test, complete accessibility audit, load test, or operational restore rehearsal with a separately stored backup.
- **Offline:** There is no PWA/service worker or offline queue. Same-device localhost use can work without internet while the server process is running; remotely hosted use requires a connection to the host.

## Agent environment

- **Canonical repository guidance:** `AGENTS.md`.
- **Supporting workflow documents:** `docs/agent-workflow/`.
- **Platform adapters:** None installed in this repository. Add only after confirming that the active tool reads them and verifying the format.
- **Skills:** No skill packages are vendored here. Select from the current agent environment only when useful; record source/version if a skill is installed into the repository.
