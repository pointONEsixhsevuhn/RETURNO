# RETURNO project status and roadmap

Reviewed: 2026-10-30

Review baseline commit: `07aec94`
Runtime checked: Node.js 24.21.0 on Windows

## Current assessment

RETURNO is a working local/small-pilot lost-and-found system. Its current architecture is a vanilla JavaScript single-page frontend, a same-origin Node.js HTTP API, and one local SQLite database. It is not yet prepared or verified for broad public hosting.

The project is on track for its agreed scope. Students create and view reports. Administrators manage report statuses, claims/returns, registered accounts, and additional administrator accounts. Student claim submission, My claims, and student proof-of-ownership APIs are excluded. The current claim/return policy is documented in [CLAIM-RETURN-REQUIREMENTS.md](CLAIM-RETURN-REQUIREMENTS.md).

## Verified baseline

- **Latest local review (2026-10-30):** full Node suite passed (**113/113**); Playwright passed (**61 passed, 3 intentional skips**); `npm.cmd run verify:workflow` passed; `npm.cmd audit --omit=dev` found **0 runtime dependency vulnerabilities**. Fixed the unreachable-server screen's link that incorrectly sent remote users to their own `localhost`.
- `npm.cmd test`: **113 passed, 0 failed** after adding keyed verification-code storage and SQLite backup/restore checks.
- `npm.cmd run test:e2e -- --trace off`: **61 passed, 3 intentional skips, 0 failed** across desktop, mobile, narrow-phone, and tablet Chromium projects. The seven-size responsive audit runs only in the desktop project. Includes the policy/About Back-navigation regression for both student and admin paths.
- Test fixtures use temporary databases and servers. Backup/restore round trips are tested on synthetic databases; these checks do not verify real Gmail delivery, physical devices, legal compliance, a live-data restore rehearsal, production hosting, or load capacity.
- GitHub Actions is configured for Node 24 on Windows and Linux. This review did not inspect a new hosted Actions run.

## Current structure

| Area | Main files | Responsibility |
| --- | --- | --- |
| Student/admin UI and hash navigation | `public/index.html`, `public/app.js`, `public/styles.css` | Screens, forms, menus, responsive layout and browser history. |
| Public legal pages | `public/terms.html`, `public/privacy.html`, `public/policies.js`, `public/policy-shell.js` | Policy content, return context and policy-page menu actions. |
| Browser/API transport | `public/api.js` | Same-origin requests, session cookies, timeouts and connection errors. |
| HTTP/API | `server.js`, `access-control.js` | Validation, authentication, authorization, row scopes, email flows and static files. |
| Persistence | `db.js`, `migrations.js`, `migrations/` | SQLite, password hashing and immutable schema migrations. |
| Mail and administration tools | `mail.js`, `scripts/` | SMTP, initial admin setup/recovery and optional fresh-database demo data. |
| Verification | `tests/`, `playwright.config.js` | Isolated unit/API/security/CLI and Chromium coverage. |

The frontend and API share one origin. Student/admin data access is enforced by server authorization and SQL scopes, not by menu visibility. See [ACCESS-CONTROL.md](ACCESS-CONTROL.md). SQLite row controls are application-enforced; this is not native database RLS.

Agent workflow policy is canonical in the repository-root [AGENTS.md](../AGENTS.md). Confirmed project facts and verification commands are indexed in [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md); supporting workflow guidance lives in [docs/agent-workflow/](agent-workflow/).

## Product and data rules

- Students can create and view reports; they cannot edit, update, or delete reports.
- Administrators manage reports and can delete another account after email confirmation. Account deletion cascades to that account's reports and sessions.
- Students can submit or cancel an account-deletion request. The request does not delete the account; an administrator reviews it.
- Students can search and browse the authenticated shared report feed. Contact details entered on a post are visible with that post.
- Active `Lost`/`Found` status matches report kind. `Claimed` and `Returned` retain the original kind. Administrators manage these outcomes; there is no student claim workflow.
- Public student registration requires a six-digit emailed verification code. This confirms signup email ownership; it is not a second factor at each login. Admin-created accounts are not email-verified by that flow.
- Signup and reset codes are stored as purpose-separated HMAC-SHA-256 digests using external `RETURNO_CODE_PEPPER`; startup rejects missing or malformed values. Pepper rotation invalidates active codes. Student password recovery uses a separate emailed code; admin password recovery remains a local CLI operation.
- **Completed 2026-10-14:** six-digit signup and reset codes now use purpose-separated, versioned HMAC digests with constant-time verification. Legacy unkeyed records are discarded on attempted use and users can request fresh codes. No schema migration was needed because the digest column already stores text.
- **Completed 2026-10-15:** SQLite-aware backup, verify, and confirmed restore commands are available. Restore validates SQLite integrity, foreign keys, and compatible migration history before replacing live data. A real operational restore rehearsal is still recommended.
- Registration policy acknowledgment is enforced by the browser UI only; server-side versioned consent records are not implemented.
- Report event time is entered and stored as campus wall time, PHT (UTC+08:00). Database timestamps are separate UTC values.
- Images accept PNG/JPEG/WebP and are capped at **10 MB**. Validation checks size and file signature, not a full image decode or dimension limit.
- Post lists are paginated in the UI (28 per page; API maximum 100). Image bytes are still included in post JSON. The admin registered-user list remains unpaginated.

## Open work, in priority order

1. **Production security before external sharing:** select persistent hosting; require HTTPS and secure cookies; move throttling to a trusted proxy/edge or shared store; add administrator MFA and alerting; store versioned Terms/Privacy acceptance on the server; encrypt and access-control SQLite backups; rehearse restore and rollback. Current rate limits are in-memory per process, policy acknowledgment is browser-only, and local SQLite has no native RLS.
2. **Administrator accountability:** record status changes and destructive actions with actor, action, target reference, and timestamp. Avoid retaining deleted account contact details in the log.
3. **Offline support (separate product phase):** there is no service worker or offline cache. First decide whether offline means a cached read-only catalogue or queued report creation. Queued writes need identity/expiry behavior, conflict handling, idempotency, and privacy controls for data cached on shared phones.
4. **Media and list performance:** decode and constrain uploaded image dimensions/pixels; separate image delivery from paginated post JSON. Add registered-user pagination if account counts grow.
5. **Maintainability and operations:** exercise a live-data restore in an isolated copy, then consider moving synchronous SQLite/scrypt work off the request event loop if load measurements justify it. Add representative Safari/WebKit and physical-device checks when those platforms become supported targets.

`npm audit --omit=dev` reported no known runtime dependency advisories in this review; rerun it before each release. That result does not replace deployment configuration, threat review, or operational monitoring.

These are recommendations, not blanket authorization to implement all phases. Continue one selected task at a time and keep student/admin permissions unchanged without a product decision.

## Delivery procedure

1. Agree on one task and its acceptance checks.
2. Change only the relevant files, tests, and roadmap status.
3. Run focused checks, `npm.cmd test`, and (for UI/auth/workflow changes) `npm.cmd run test:e2e`.
4. Review `git diff --check` and stage only that task.
5. Create one descriptive commit and push it to the configured GitHub remote. Never force-push or include credentials, `.env`, databases, or unrelated edits.
6. Report test evidence, commit/push status, and the next recommended task.

On Windows PowerShell, use `npm.cmd` if the `npm.ps1` execution policy blocks `npm`.
