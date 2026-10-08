# RETURNO review and project roadmap

Reviewed: 2026-10-08. Baseline: version 1.3.0, Node.js 24.21.0 on Windows.

## Review result

The project is a functioning local prototype with a vanilla HTML/CSS/JavaScript frontend, a Node HTTP API, and persistent SQLite storage. It is not yet verified for public production use.

Reviewed frontend navigation, forms, search, dialogs and styles; API authentication, roles, validation and static serving; schema and password/session handling; startup, administrator and demo scripts; and the existing test suite.

Strengths: parameterized SQL, salted scrypt passwords, hashed random session tokens, HttpOnly/SameSite cookies, role checks on management endpoints, transactional student registration, escaped user text in generated HTML, security headers, and foreign-key/schema constraints.

## Test evidence

- Initial full run: 22 passed, 1 failed. CSS assertions depended on minified whitespace despite the required declarations being present.
- Fixed the three assertions to tolerate whitespace without removing their required layout checks.
- Final `npm.cmd test`: 23 passed, 0 failed, 0 skipped.
- `node --check`: passed for all JavaScript in the root, public, scripts, and tests directories.
- `git diff --check`: passed after the test change.
- Tests use isolated temporary databases. No existing user database was changed.
- The suite exercises HTTP registration/login/logout, role restrictions, student creation and admin post lifecycle, search, images, origin checks, persistence reads, rollback and schema integrity. Client tests cover request failures; UI tests use a VM and simulated DOM.
- The logged `test session failure` is deliberately injected by the passing registration rollback test.
- Real-browser rendering, mobile devices, full browser end-to-end flows, startup/admin/recovery/demo CLI interactions, load testing, backup restoration and hosted deployment have not been verified. Persistence tests read through another database connection; they do not establish restart recovery under failure.

On Windows, use `npm.cmd test` and `npm.cmd start` if PowerShell blocks `npm.ps1`. No execution-policy change is required.

## Findings to address

| Priority | Finding and evidence | Next action |
| --- | --- | --- |
| Completed | Visible logout is available in student/admin page headers. It revokes the current session and clears client state; expired sessions also exit cleanly. | Verified by UI simulation and backend session tests. Broader expired-session flows remain a subsequent task. |
| Medium | `server.js` checks dates using a regex plus `Date.parse`. A direct runtime probe accepts `2026-02-30T12:00` and normalizes it into March. | Reject impossible calendar dates explicitly; define the campus timezone convention. |
| High before public hosting | HTTPS cookies require `COOKIE_SECURE=true`; authentication throttling uses an in-memory map keyed by socket IP; scrypt and SQLite operations run synchronously. | Verify production configuration, proxy behavior, abuse controls and concurrent-load response times. |
| Medium | Post lists return every matching row including base64 images; the admin user list also has no pagination. | Add bounded pagination, lightweight list responses and separate image retrieval. |
| Medium | Images are checked by size and magic bytes, not by decoding the entire image. | Add decoding/dimension limits if public uploads are enabled. |
| Medium | Status changes and deletion leave no administrator audit history. Claimant identity and return proof are not represented in the schema. | Define a claim-review process; record actor, timestamps and status transitions. |
| Medium | Schema creation uses `CREATE TABLE IF NOT EXISTS`; there is no versioned migration or backup/restore workflow. | Add migration tracking and a tested SQLite-aware backup/restore procedure. |
| Medium | Frontend search and image reading are asynchronous. Navigation and overlapping requests need real-browser race checks. | Test slow requests, rapid search, navigation during requests and repeated image selection. |
| Medium | No GitHub Actions workflow or actual browser automation exists. CSS source assertions do not prove visual layout. | Add CI and browser tests; inspect mobile/desktop rendering and keyboard use. |
| Product gap | Student recovery/email verification are absent; privacy/terms are displayed as text. | Decide account verification/recovery requirements and supply approved policy content before launch. |

These are source-review findings and targeted runtime evidence, not proof of a complete security audit. Existing student management restrictions are intentional requirements, not a bug to remove automatically.

## Recommended sequence

Each semicolon-separated item below should be a separate feature/fix commit and push, with relevant acceptance tests.

| Phase | Tasks in order | Completion gate |
| --- | --- | --- |
| 0: Baseline (complete) | Review source; run automated tests; repair formatting-sensitive test; document workflow and roadmap. | 23 tests pass and review/workflow records are published. |
| 1: Reliable user flows | Visible logout; expired-session handling; strict calendar validation and timezone convention; loading/empty/error states and asynchronous race fixes. | Both roles can log out and recover cleanly from failures; invalid dates are rejected. |
| 2: Repeatable verification | GitHub Actions tests on Windows/Linux with Node 24; real-browser student/admin end-to-end tests; mobile and keyboard checks; isolated tests for setup/recovery/demo scripts. | CI results are verified; representative browser flows pass without touching real data. |
| 3: Lost-and-found completion | Agree claim/return requirements; student claim request; administrator verification; controlled status transitions; audit history and recoverable post archival. | A report can reach a verified return with an accountable history. |
| 4: Accounts and administration | Decide campus account eligibility; email verification; secure student recovery; admin account lifecycle and permissions; real privacy/terms screens. | Account and recovery scenarios pass; admin access remains restricted. |
| 5: Data and performance | Schema migrations; safe backup and restore; post/user pagination; separate image delivery; upload dimension limits; measured load testing. | Restore succeeds on isolated data and realistic list/load tests meet agreed limits. |
| 6: Staging and launch | Select a host supporting Node and persistent SQLite storage; configure HTTPS and secure cookies; validate proxy/throttling; monitoring; staging acceptance; production release and rollback plan. | A fresh deployment and restore are verified, and user acceptance is complete. |

Completed feature (2026-10-08): **visible logout for students and admins**. The current session is revoked, the cookie is cleared, private client state and the remembered role are cleared, and navigation returns to role selection. Browser Back cannot restore an authenticated screen. Failed network requests retain the session and allow retry; a 401 during logout clears the already-expired client session. Header controls wrap to accommodate the new button. Full suite: **27 passed, 0 failed**. Browser/device visual verification remains pending.

Suggested next task: **consistent expired-session handling** across post submission, search, and administrator actions, so all protected requests clear stale account state and return to login. Strict calendar validation follows as its own fix.

Optional later additions: notifications, matching suggestions and analytics, after claim/return behavior is stable. Do not add messaging or broaden student editing permissions without agreeing the scope.

## Feature delivery procedure

1. State the feature and acceptance criteria.
2. Implement only that feature and its relevant tests/docs.
3. Run focused checks and the full suite; inspect browser behavior where relevant.
4. Review the diff and stage only the feature files.
5. Commit with a clear `feat:`, `fix:`, `test:` or `docs:` message.
6. Push to GitHub and verify the push. If CI exists, inspect its result separately.
7. Report the commit link, evidence and next task; update roadmap status when it changes.

Never publish credentials or databases, force-push, or commit unrelated edits as part of this procedure.

## Reference guidance

- GitHub's Node CI guide: https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs
- SQLite online backup guidance: https://www.sqlite.org/backup.html
