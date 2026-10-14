# RETURNO project context

This is a factual index for agents and contributors. `AGENTS.md` is the canonical policy; use linked documents for details rather than duplicating mutable implementation facts.

## Product and users

- **Product:** NVSU RETURNO, a campus lost-and-found system for reporting and finding belongings.
- **Primary users:** Students create and browse/search reports; administrators manage reports, account requests, and other accounts.
- **Main outcomes:** Publish a Lost/Found report, find matching reports, contact the poster, and let administrators manage return statuses.
- **Out of scope:** Student claim submission, My claims, student proof-of-ownership forms/APIs, and student post editing/status/deletion. Administrators manage claim/return processing.
- **Product decisions:** See [claim and return requirements](docs/CLAIM-RETURN-REQUIREMENTS.md) and the rules in `AGENTS.md`.

## Repository and architecture

- **Stack:** Node.js 24 or newer, npm, browser-native HTML/CSS/JavaScript, Node HTTP server, SQLite via `node:sqlite`.
- **Package manager:** npm; `package-lock.json` is committed.
- **Entry points:** `scripts/start.js` starts the service; `server.js` implements the HTTP/API layer; `public/index.html` and `public/app.js` implement the SPA; `public/terms.html` and `public/privacy.html` are standalone policy documents.
- **Architecture:** Same-origin browser and API, one Node process and local SQLite database. Authorization and row scoping are enforced in application code; SQLite native RLS is not used. See [system design](docs/SYSTEM-DESIGN.md) and [access control](docs/ACCESS-CONTROL.md).
- **Brand and UI:** `public/styles.css`, `public/assets/`, brown/white RETURNO theme; keep status badges at the upper-right of post cards.
- **Data migrations:** Numbered, immutable SQL migrations in `migrations/`; read [migration procedure](docs/DATABASE-MIGRATIONS.md) before schema work.

## Constraints, sensitive data, and ownership

- Student/admin separation and the exclusion of student claims are product constraints. Do not broaden permissions without an explicit product decision.
- Student signup and password recovery use emailed codes. Signup email confirmation is not a second authentication factor. Admin recovery is a local CLI workflow.
- Post contact information is displayed with the report. Report event time is campus wall time (PHT, UTC+08:00).
- Secrets: `.env`, SMTP credentials, `RETURNO_CODE_PEPPER`, session tokens, passwords, and verification/reset codes. Do not print or commit them; keep the code pepper outside SQLite and its backups.
- Personal data: SQLite records include account emails/names, reports, and contact information. Use isolated temporary databases and synthetic records in tests.
- The user is the product decision owner. Preserve existing scope; seek a decision when an unresolved product or destructive-data choice is required. Follow `AGENTS.md` for commit/push authorization and workflow.

## Verification

| Check | Command | Purpose and scope |
| --- | --- | --- |
| Workflow scaffolding | `npm.cmd run verify:workflow` | Required handoff docs exist and context has no template markers; structural check only. |
| Unit/API/security/CLI | `npm.cmd test` | Isolated temporary databases; no live account data. |
| Browser flows | `npm.cmd run test:e2e -- --trace off` | Isolated server/database; desktop, mobile, 320px phone, and tablet Chromium projects. |
| Dependency advisory check | `npm.cmd audit --omit=dev` | Reads npm advisory service; requires network and can change over time. |
| Diff whitespace | `git diff --check` | Check current unstaged/staged changes for whitespace errors. |

- **Runtime:** Node.js 24+; tested locally on Node.js 24.21.0 Windows (see current roadmap for latest evidence).
- **CI:** `.github/workflows/tests.yml`, Node 24 on Windows and Linux. Verify the hosted Actions run separately; local tests do not prove CI passed.
- **Known limits:** No verified public deployment, physical-device run, live SMTP inbox test, complete accessibility audit, load test, or SQLite restore test.

## Agent environment

- **Canonical repository guidance:** `AGENTS.md`.
- **Supporting workflow documents:** `docs/agent-workflow/`.
- **Platform adapters:** None installed in this repository. Add only after confirming that the active tool reads them and verifying the format.
- **Skills:** No skill packages are vendored here. Select from the current agent environment only when useful; record source/version if a skill is installed into the repository.
