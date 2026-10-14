# RETURNO project status and roadmap

Reviewed: 2026-10-14

Review baseline commit: `acae536`
Runtime checked: Node.js 24.21.0 on Windows

## Current assessment

RETURNO is a working local/small-pilot lost-and-found system. Its current architecture is a vanilla JavaScript single-page frontend, a same-origin Node.js HTTP API, and one local SQLite database. It is not yet prepared or verified for broad public hosting.

The project is on track for its agreed scope. Students create and view reports. Administrators manage report statuses, claims/returns, registered accounts, and additional administrator accounts. Student claim submission, My claims, and student proof-of-ownership APIs are excluded. The current claim/return policy is documented in [CLAIM-RETURN-REQUIREMENTS.md](CLAIM-RETURN-REQUIREMENTS.md).

## Verified baseline

- `npm.cmd test`: **110 passed, 0 failed** after adding keyed verification-code storage.
- `npm.cmd run test:e2e -- --trace off`: **61 passed, 3 intentional skips, 0 failed** across desktop, mobile, narrow-phone, and tablet Chromium projects. The seven-size responsive audit runs only in the desktop project. Includes the policy/About Back-navigation regression for both student and admin paths.
- Test fixtures use temporary databases and servers. These checks do not verify real Gmail delivery, physical devices, legal compliance, backup restoration, production hosting, or load capacity.
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
- Registration policy acknowledgment is enforced by the browser UI only; server-side versioned consent records are not implemented.
- Report event time is entered and stored as campus wall time, PHT (UTC+08:00). Database timestamps are separate UTC values.
- Images accept PNG/JPEG/WebP and are capped at **10 MB**. Validation checks size and file signature, not a full image decode or dimension limit.
- Post lists are paginated in the UI (28 per page; API maximum 100). Image bytes are still included in post JSON. The admin registered-user list remains unpaginated.

## Open work, in priority order

1. **Data recovery and accountability:** implement and test a SQLite-aware backup/restore procedure; add administrator history for status changes and destructive actions.
2. **Media and list performance:** validate decoded image dimensions and separate image delivery from paginated post JSON. Add registered-user pagination if account counts grow.
3. **Production readiness:** choose persistent hosting, configure HTTPS and secure cookies, verify proxy-aware throttling, email delivery, monitoring, restore, and rollback. Run realistic load and deployment checks.
4. **Maintainability:** as more work is approved, split the large UI controller and HTTP handler along route/view and domain boundaries. Avoid a framework rewrite without a concrete need.

These are recommendations, not blanket authorization to implement all phases. Continue one selected task at a time and keep student/admin permissions unchanged without a product decision.

## Delivery procedure

1. Agree on one task and its acceptance checks.
2. Change only the relevant files, tests, and roadmap status.
3. Run focused checks, `npm.cmd test`, and (for UI/auth/workflow changes) `npm.cmd run test:e2e`.
4. Review `git diff --check` and stage only that task.
5. Create one descriptive commit and push it to the configured GitHub remote. Never force-push or include credentials, `.env`, databases, or unrelated edits.
6. Report test evidence, commit/push status, and the next recommended task.

On Windows PowerShell, use `npm.cmd` if the `npm.ps1` execution policy blocks `npm`.
