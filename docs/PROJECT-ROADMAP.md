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
- At initial review, browser and CLI interactions were unverified. Subsequent completed tasks below establish Chromium viewport/keyboard checks and isolated CLI lifecycle/process-restart checks. Physical devices, load testing, backup restoration, power-loss recovery and hosted deployment remain unverified.

On Windows, use `npm.cmd test` and `npm.cmd start` if PowerShell blocks `npm.ps1`. No execution-policy change is required.

## Findings to address

| Priority | Finding and evidence | Next action |
| --- | --- | --- |
| Completed | Visible logout is available in student/admin page headers. It revokes the current session and clears client state; expired sessions also exit cleanly. | Verified by UI simulation and backend session tests. Broader expired-session flows remain a subsequent task. |
| Completed | Creation and editing use explicit Gregorian date/time validation, including century leap-year rules. Report times are labeled PHT (UTC+08:00) and kept independent of server timezone. | Existing records retain their original values; historical date cleanup is a separate task if needed. |
| High before public hosting | HTTPS cookies require `COOKIE_SECURE=true`; authentication throttling uses an in-memory map keyed by socket IP; scrypt and SQLite operations run synchronously. | Verify production configuration, proxy behavior, abuse controls and concurrent-load response times. |
| Medium | Post lists return every matching row including base64 images; the admin user list also has no pagination. | Add bounded pagination, lightweight list responses and separate image retrieval. |
| Medium | Images are checked by size and magic bytes, not by decoding the entire image. | Add decoding/dimension limits if public uploads are enabled. |
| Medium | Status changes and deletion leave no administrator audit history. Claimant identity and return proof are not represented in the schema. | Define a claim-review process; record actor, timestamps and status transitions. |
| Medium | Schema creation uses `CREATE TABLE IF NOT EXISTS`; there is no versioned migration or backup/restore workflow. | Add migration tracking and a tested SQLite-aware backup/restore procedure. |
| Automated checks complete | Search invalidates outdated responses immediately on typing; queued searches cannot run after navigation. Image reads use selection/page versions, and delayed post saves cannot redirect a newer screen. | 49 automated tests pass; real-browser race checks remain pending. |
| Browser coverage started | Six real Chromium cases pass locally across desktop/mobile viewports, alongside the 49 API/client tests. Both suites also pass in Windows/Linux CI. | Expand layout/keyboard checks and browser coverage. |
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

Completed feature (2026-10-08): **consistent expired-session handling** across protected requests. Posting, search, feed and administrator actions clear private state and return to the current role's login with an expiry message. Late responses from the old session are ignored; login credential errors, permission denials and network failures retain their normal handling. Database expiry is tested for both roles. Full suite: **33 passed, 0 failed**; real-browser verification remains pending.

Completed fix (2026-10-08): **strict calendar validation and campus timezone convention**. Reject impossible dates and out-of-range times on creation and editing; invalid edits leave the stored event time unchanged. Accept valid leap days and years 0001 through 9999. Event times are stored and displayed as Philippine campus wall time (PHT, UTC+08:00 / Asia/Manila), without server timezone conversion. Existing records are preserved. Tests cover calendar boundaries, invalid formats, century leap years, and three server timezones. Full suite: **36 passed, 0 failed**; browser/device verification remains pending.

Completed feature (2026-10-08): **loading, empty, and retry states** for feed, own posts, search, and administrator lists. Loading replaces stale results; empty own-post lists retain Add post; administrator status filters explain zero results. Network/server failures offer explicit manual retries preserving the original filter or query. Protected-session failures keep the login redirect. Delayed list failures are ignored after navigation. Full suite: **41 passed, 0 failed**; browser/device verification remains pending.

Completed fix (2026-10-08): **search, navigation and image-selection races**. Typing invalidates old searches before the debounce runs; submitting/category selection cancels queued typing; queued searches check the original page before requesting or changing state. Older image successes/failures cannot replace newer previews, clear newer validation errors, or unblock a newer pending read. Leaving the editor invalidates its image callbacks and prevents delayed post saves from redirecting a new screen. Invalid image selections invalidate earlier pending reads while retaining the last completed preview. Full suite: **49 passed, 0 failed**, including controlled out-of-order requests/read callbacks. Real-browser/device verification remains pending.

Completed CI feature (2026-10-08): `.github/workflows/ci.yml` runs all tests on Node 24 using Windows and Linux runners for pushes, pull requests and manual dispatch. Official actions are pinned to commit references, repository permissions are read-only, and checkout does not retain credentials. Jobs run independently with a 10-minute timeout; superseded runs are canceled. Tests need no installed dependencies because they use Node built-ins. Local suite: **49 passed, 0 failed**. First hosted run on commit `18c111b`: **Windows success, Linux success, workflow success**, verified through GitHub's Actions API. Evidence: https://github.com/pointONEsixhsevuhn/RETURNO/actions/runs/37728607545. The push path is verified; pull-request and manual triggers are configured but have not been separately exercised.

Completed browser E2E feature (2026-10-08): Playwright covers student registration, image posting, permissions, search, logout/relogin, administrator review/edit/return/delete, session revocation recovery, and search retry/clearing. Three scenarios run on desktop Chromium and a Pixel 5 Chromium viewport, for **6 browser tests passed locally**, with **49 existing tests passed**. Each worker owns a temporary database and ephemeral localhost server; no user data is used. Tests check uncaught page errors, keyboard card activation/Escape and horizontal overflow. CI installs dependencies and Chromium and runs both suites on Windows/Linux; failed runs retain trace/screenshots for seven days. Hosted run on commit `6d61087`: **Windows success, Linux success, workflow success**, verified through GitHub's Actions API. Evidence: https://github.com/pointONEsixhsevuhn/RETURNO/actions/runs/37729338581. This does not establish physical-device, Firefox/WebKit, pixel-level or full accessibility coverage.

Completed responsive/keyboard feature (2026-10-08): five scenarios now run across desktop, Pixel 5, 320px narrow-phone and 768px tablet Chromium viewports (**20 browser cases**). Added keyboard-only registration, navigation, report type/text controls, card activation, search/logout, password visibility, failed login and loading/error/retry checks. Tests verify visible card focus, dialog close/Escape focus restoration and horizontal overflow. Dialogs now have explicit accessible names, with item/status/delete names checked in the browser. Local suite: **49 existing tests and 20 browser cases passed**. Hosted run on commit `215956a`: **Windows success, Linux success, workflow success**, verified through GitHub's Actions API. Evidence: https://github.com/pointONEsixhsevuhn/RETURNO/actions/runs/37730546235. This is not a complete accessibility audit: screen readers, contrast, physical devices and other browser engines remain unverified.

Completed CLI verification (2026-10-08): eight isolated subprocess tests cover interactive/environment administrator creation, validation and duplicate refusal; recovery rejection, transaction rollback and selective session revocation; demo seeding and refusal without changing existing records; real process-restart persistence; occupied-port/unusable-data-path errors; and the unsupported-Node startup guard (simulated, not an older-runtime compatibility run). Recovery invalidates all selected-admin sessions, preserves another admin's session, rejects the old password and permits the new password. Local suite: **57 tests passed**; **20 browser cases passed**. Hosted run on commit `a314ead`: **Windows success, Linux success, workflow success**, verified through GitHub's Actions API. Evidence: https://github.com/pointONEsixhsevuhn/RETURNO/actions/runs/37731422984.

Completed planning draft (2026-10-08): [claim/return requirements](CLAIM-RETURN-REQUIREMENTS.md) records current behavior, private claims and administrator verification/handover, rejection/retry rules, transactional transitions, history/archival, legacy-record handling, acceptance checks and separate delivery tasks. The user approved the core workflow: students submit private proof on Found reports; administrators approve and confirm physical handover. Remaining detailed rules are proposed for review; no permissions, schema or application behavior changed.

Completed migration prerequisite (2026-10-08): startup runs immutable numbered SQL migrations, records names/checksums/timestamps and refuses mismatched/newer history. Fresh and legacy databases enroll without rewriting users, sessions, reports or legacy statuses. Pending schema/data/history changes commit together or roll back together, with foreign-key checks before commit. Eight isolated migration tests cover preservation, reopen/idempotency, failed enrollment/batch rollback and retry, invalid history/definitions, foreign-key violations and Windows/Linux line endings. Local full suite: **65 passed**. See [migration procedure](DATABASE-MIGRATIONS.md). Local browser suite: **20 passed**. Hosted run on commit `7080dea`: **Windows success, Linux success, workflow success**, verified through GitHub's Actions API. Evidence: https://github.com/pointONEsixhsevuhn/RETURNO/actions/runs/37732508472.

Completed private claim API (2026-10-08): the user approved active Found reports from another student, 20–2,000-character private proof, one pending request per student/report, competing pending students and preservation of legacy outcomes. Migration 2 adds private claim storage and deletion protection. Student-only submission and own-claim reads enforce identity/eligibility, transactionally reject duplicates, and exclude proof from report lists/search. No claim UI or review/return commands are added yet. Full local suite: **70 passed**. The API contract was retired by the later product reversal. Local browser regressions: **20 passed**. Hosted run on commit `d990587`: **Windows success, Linux success, workflow success**, verified through GitHub's Actions API. Evidence: https://github.com/pointONEsixhsevuhn/RETURNO/actions/runs/37733723586.

Product reversal (2026-10-08): student claims are excluded at the user's request. Removed unpublished student screens and published claim endpoints; migration 3 preserves retired submissions without restricting administrator report deletion. Administrators manage claims/returns; earlier student-claim proposals and approval are superseded.

Completed search-picture fix (2026-10-08): category images use the available tile space instead of a percentage height, preserving the full picture with contain sizing. Report image frames no longer shrink inside cards. Full suite: **67 passed**; **20 browser cases passed**, with focused category-image bounds/contain checks across desktop, mobile, narrow-phone and tablet viewports.

Completed item artwork replacement (2026-10-08): the six supplied wallet/key/phone/tumbler/ID/bracelet images were edited into transparent PNG cutouts and installed under the existing application asset names. Complete objects remain visible with contain sizing; no checkerboard backdrop is used as a substitute for transparency. The supplied originals are preserved locally under ignored `public/assets/originals/` and are not published. Existing attribution markings are retained. Category browser checks now require successfully decoded images as well as containment. Local full suite: **67 passed**; **20 browser cases passed**, including decoded-image/containment checks on four viewports.

Completed admin layout update (2026-10-08): admin home shows reports; Lost/Returned/Found/Claimed totals and registered users move to an admin-only profile route reached through the profile icon. Student and administrator accounts appear in separate labeled boxes with separate counts. Profile status buttons open the matching report filter; registration, loading/retry and role restrictions are preserved. Full suite: **67 passed**; **20 browser cases passed**, including keyboard profile navigation and separate user sections on four viewports.

Admin layout adjustment (2026-10-08): Lost/Returned/Found/Claimed totals are back on administrator home with their report filters. Registered users remain on the admin profile, ordered Admin users first and Student users second. Local suite: **67 passed**; **20 browser cases passed** across four viewports.

Completed header adjustment (2026-10-08): search and profile icons share a non-wrapping group so they stay beside each other when header actions wrap on smaller screens. Full suite: **67 passed**; **20 browser cases passed** across four viewports.

Registered-user layout correction (2026-10-08): Admin users and Student users use a single column on every screen size, with Student users below Admin users. Full suite: **67 passed**; **20 browser cases passed** across four viewports.

Completed header alignment (2026-10-08): Log out, Register admin, Search and Profile form one row centered beside the RETURNO logo. Removed the action-width cap that forced wrapping; compact phone spacing preserves the row within narrow screens. Full suite: **67 passed**; **20 browser cases passed** across four viewports.

Completed access-control hardening (2026-10-08): centralized deny-by-default RBAC covers every protected route/method. Own-report queries derive identity from sessions; management queries/mutations and admin lists/totals use stored-role SQL scopes. Protected body reads recheck session identity/role before writes. Parameterized queries and fixed SQL fragments preserve literal SQL-like text without executing it; explicit report projections and static denial of source backups limit unintended disclosure. This is application-enforced row security on SQLite, not native database RLS. Six additional adversarial checks bring the local suite to **73 passed**; **20 browser cases passed** across four viewports. See [policy and SQL safety](ACCESS-CONTROL.md).

Completed login icon update (2026-10-08): password visibility uses a magnifying glass instead of Show/Hide text. Hidden passwords use a fully dark lens; visible passwords use a white-centered lens. Accessible Show/Hide password labels, pressed state and keyboard control remain. Full suite: **73 passed**; **20 browser cases passed** across four viewports.

Completed password-entry refinement (2026-10-08): login password text is centered using balanced horizontal padding. The visibility magnifier is reduced to 20px with a shorter handle; hidden/visible states and accessible controls remain. Full suite: **73 passed**; **20 browser cases passed** across four viewports.

Suggested next task: **administrator action history** for status changes, with actor/time and prior/new status. Agree administrator verification and handover details before further workflow changes.

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

Registration email verification (2026-10-08): new public signups receive a six-digit ownership code before account/session creation. Codes expire in 10 minutes, are single-use, hashed, restricted to five attempts, and have a one-minute resend cooldown plus a per-email concurrent-send guard. SMTP failures do not create accounts. Gmail SMTP sender setup is documented in [email verification](EMAIL-VERIFICATION.md); existing accounts and administrator provisioning retain their previous behavior. This is signup email confirmation, not a second login factor. Local full suite: **78 passed**; **20 Chromium browser cases passed** across four viewports, including wrong-code recovery and keyboard confirmation. Automated transport tests do not establish live Gmail delivery; local sender credentials and a real inbox check are the next setup task.
