# RETURNO project status and roadmap

Reviewed: 2026-10-31

Review baseline commit: `75c3490`
Runtime checked: Node.js 24.21.0 on Windows

## Current assessment

RETURNO is a working local/small-pilot lost-and-found system. Its current architecture is a vanilla JavaScript single-page frontend, a same-origin Node.js HTTP API, and one local SQLite database. It is not yet prepared or verified for broad public hosting.

The project is on track for its agreed scope. Students create and view reports. Administrators manage report statuses, claims/returns, registered accounts, and additional administrator accounts. Student claim submission, My claims, and student proof-of-ownership APIs are excluded. The current claim/return policy is documented in [CLAIM-RETURN-REQUIREMENTS.md](CLAIM-RETURN-REQUIREMENTS.md).

## Verified baseline

- **Postgres persistence foundation (2026-10-31):** added the `pg` driver, asynchronous database calls with isolated request-scoped transactions, parameterized SQLite-to-Postgres query conversion, and a Supabase schema for current tables with RLS enabled and browser-role table grants revoked. Added mock-pool/schema tests. Full Node suite passed (**129/129**); Playwright passed (**61 passed, 3 intentional skips**); runtime audit found **0 vulnerabilities**; workflow, syntax/config, and whitespace checks passed. No live Supabase connection or SQL execution was available. Vercel readiness remains blocked: image upload needs direct private Storage transfer because the function body limit is below RETURNO's 10 MB image cap, and distributed rate limiting and real Postgres integration tests are still needed. The `RETURNO_POSTGRES_READY` flag remains unset. See [Vercel migration status](VERCEL-DEPLOYMENT.md).

- **Vercel migration scaffold (2026-10-31):** added a Vercel Node function entry point and routes static output from `public/`; local development continues to use SQLite. Added an explicit Vercel startup guard so the current non-persistent SQLite database cannot silently receive live users or reports. Full Node suite passed (**126/126**); Playwright passed (**61 passed, 3 intentional skips**); workflow verification, JSON/syntax checks, and `git diff --check` passed. This is not a deployable Vercel release: Supabase Postgres, private image storage, SMTP/security environment configuration, and Vercel CLI/live deployment verification remain outstanding. See [Vercel migration status](VERCEL-DEPLOYMENT.md).

- **Single-host deployment preparation (2026-10-31):** added a production Node 24 container, Compose configuration with persistent SQLite storage, a non-root/read-only app container, and Caddy HTTPS reverse proxy. Added a deployment guide for a single Linux VM. Full Node tests passed (**124/124**), Playwright passed (**61 passed, 3 intentional skips**), workflow verification and formatting checks passed, and `git diff --check` passed. Docker is not installed in the current Windows environment, so the container build and live HTTPS deployment remain unverified; the guide records that limitation and the operator steps still required. Existing application behavior and database remain unchanged.

- **Temporary Cloudflare testing (2026-10-31):** added a Windows launcher for the existing local server and a Cloudflare Quick Tunnel URL. The launcher checks Node/`cloudflared`, waits for `/api/health`, sets Secure session cookies for the public HTTPS URL, and stops the local server it started when the tunnel exits. This is a temporary test link, not a persistent Cloudflare Workers deployment; no Worker/D1 migration or public tunnel run was performed. Full Node suite passed (**124/124**), workflow verification passed, PowerShell syntax parsing passed, and `git diff --check` passed.

- **Uploaded-image validation (2026-10-31):** added Sharp-based full decode and re-encoding; validates the declared type against decoded format, rejects corrupt input, animated files, images over 16 megapixels or 8,000 pixels per side, strips metadata, and proportionally resizes to at most 2,560 × 2,560 while keeping the 10 MB upload cap. Full Node suite passed (**124/124**); Playwright passed (**61 passed, 3 intentional skips**) across desktop, mobile, narrow-phone, and tablet; `npm.cmd audit` and `npm.cmd audit --omit=dev` both found **0 vulnerabilities**; workflow verification and `git diff --check` passed.
- **Bounded request throttling (2026-10-31):** kept the existing 40 sensitive requests per remote address per 15 minutes, while capping in-process limiter state at 20,000 addresses and replacing a full map scan on every request with periodic expiry cleanup. The limiter fails closed for new addresses while at capacity. Full Node suite passed (**123/123**); Playwright passed (**61 passed, 3 intentional skips**) across desktop, mobile, narrow-phone, and tablet; workflow verification and `git diff --check` passed.
- **Privacy notice accuracy (2026-10-31):** replaced generic, unsupported statements with the implemented account/report data, visibility of report contacts to signed-in users, email flows, browser storage, database deletion behavior, and backup limits. Bumped recorded privacy acceptance version to `1.1` for new registrations; existing accounts retain their recorded version. The notice is implementation-based and is not ready for public release until the operator confirms the listed institution-specific details and obtains campus privacy/legal review. Full Node suite passed (**119/119**); Playwright passed (**61 passed, 3 intentional skips**) across desktop, mobile, narrow-phone, and tablet; workflow verification and `git diff --check` passed.
- **Whole-system audit (2026-10-31):** Reviewed architecture, route permissions, session and email flows, SQL scopes, static serving/security headers, uploads, data recovery, privacy notice, navigation, and responsive/browser coverage. Full Node suite passed (**119/119**); Playwright passed (**61 passed, 3 intentional skips**); workflow verification passed; `npm.cmd audit --omit=dev` found **0 runtime dependency vulnerabilities**. Corrected the stale system-design statement about policy acceptance. This is a source review and automated verification, not a penetration test, legal review, or public-deployment assessment.
- **Security configuration review (2026-10-30):** full Node suite passed (**116/116**); Playwright passed (**61 passed, 3 intentional skips**); `npm.cmd run verify:workflow` passed; `npm.cmd audit --omit=dev` found **0 runtime dependency vulnerabilities**. Added server-enforced policy acceptance, a production secure-cookie startup guard, and first-run generation of a persistent local verification key; fixed the unreachable-server screen's link that incorrectly sent remote users to their own `localhost`.
- **Navigation fix (2026-10-30):** Back from student/admin post editing now returns to the originating screen while retaining the relevant search, filters, and page; browser Back closes confirmation/detail dialogs in place. Full Node suite passed (**116/116**) and Playwright passed (**61 passed, 3 intentional skips**) across desktop, mobile, narrow-phone, and tablet Chromium projects.
- **Student outcome notifications (2026-10-30):** Students can notify administrators that their own Lost item was claimed by its owner or their own Found item was returned to its owner. The API enforces the matching outcome; admins can apply that status or dismiss. The student card opens details directly without a duplicate button and uses its awaiting-review status as the confirmation without a second success banner. Admins open the review inbox from the compact menu, below Register admin; the menu shows a live digits-only count of pending notifications and updates after review. Full Node suite passed (**119/119**), workflow verification passed, and full Playwright passed (**61 passed, 3 intentional skips**) across desktop, mobile, narrow-phone, and tablet. The focused notification-count flow passed on desktop.
- `npm.cmd test`: **116 passed, 0 failed** after adding policy acceptance, secure-cookie configuration, and automatic local verification-key setup, alongside keyed verification-code storage and SQLite backup/restore checks.
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
- Students may submit one pending Claimed/Returned notification for their own active post. It does not alter status; the administrator chooses the final status or dismisses it. Admin status updates also resolve pending notifications; account/post deletion cascades the notification.
- Students can search and browse the authenticated shared report feed. Contact details entered on a post are visible with that post.
- Active `Lost`/`Found` status matches report kind. `Claimed` and `Returned` retain the original kind. Administrators manage these outcomes; there is no student claim workflow.
- Public student registration requires a six-digit emailed verification code. This confirms signup email ownership; it is not a second factor at each login. Admin-created accounts are not email-verified by that flow.
- Signup and reset codes are stored as purpose-separated HMAC-SHA-256 digests using a stable 32-byte pepper; local startup generates and persists one if none is configured, and malformed explicit values are rejected. Pepper rotation invalidates active codes. Student password recovery uses a separate emailed code; admin password recovery remains a local CLI operation.
- **Completed 2026-10-14:** six-digit signup and reset codes now use purpose-separated, versioned HMAC digests with constant-time verification. Legacy unkeyed records are discarded on attempted use and users can request fresh codes. No schema migration was needed because the digest column already stores text.
- **Completed 2026-10-15:** SQLite-aware backup, verify, and confirmed restore commands are available. Restore validates SQLite integrity, foreign keys, and compatible migration history before replacing live data. A real operational restore rehearsal is still recommended.
- New registration requires the Terms & Conditions / Privacy Policy checkbox on both browser and API. On successful email verification, the server records policy versions (`1.0` / `1.1`) and acceptance time keyed to the new account; these records cascade on account deletion. Bump the corresponding server-side version whenever the legal document changes. Existing accounts retain their recorded acceptance; no retroactive acceptance is inferred. Pending signups from before this migration must register again because their acceptance cannot be established retroactively.
- Report event time is entered and stored as campus wall time, PHT (UTC+08:00). Database timestamps are separate UTC values.
- Images accept PNG/JPEG/WebP and are capped at **10 MB**. Sharp fully decodes/re-encodes uploads, checks declared type against decoded format, rejects images over 16 megapixels or 8,000 pixels per side, strips metadata, and resizes proportionally to fit within 2,560 × 2,560 pixels. Image bytes remain included in paginated post JSON.
- Post lists are paginated in the UI (28 per page; API maximum 100). Image bytes are still included in post JSON. The admin registered-user list remains unpaginated.

## Open work, in priority order

1. **Privacy notice publication approval:** the implementation-based notice now explains current application data and behavior. Before external sharing, confirm the institution-approved data controller/contact, actual host and SMTP providers, retention schedule for accounts/reports/operational records/backups, and approved legal wording; obtain campus privacy/legal review. Do not infer legal requirements from this code review.
2. **Production security before external sharing:** provision and verify a persistent host using [the single-host deployment guide](DEPLOYMENT.md); terminate HTTPS at the host (production startup now fails unless secure cookies are enabled); move throttling to a trusted proxy/edge or shared store; add administrator MFA and alerting; encrypt and access-control SQLite backups; rehearse restore and rollback. Application throttling is now bounded but remains in-memory per process, so it does not coordinate limits across instances or survive restarts. Local SQLite has no native RLS.
3. **Administrator accountability:** record status changes and destructive actions with actor, action, target reference, and timestamp. Avoid retaining deleted account contact details in the log.
4. **Offline support (separate product phase):** there is no service worker or offline cache. First decide whether offline means a cached read-only catalogue or queued report creation. Queued writes need identity/expiry behavior, conflict handling, idempotency, and privacy controls for data cached on shared phones.
5. **Media and list performance:** image decoding, pixel limits, metadata stripping, and proportional resizing are implemented. Separate image delivery from paginated post JSON; add registered-user pagination if account counts grow.
6. **Maintainability and operations:** exercise a live-data restore in an isolated copy, then consider moving synchronous SQLite/scrypt work off the request event loop if load measurements justify it. Add representative Safari/WebKit and physical-device checks when those platforms become supported targets.

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
