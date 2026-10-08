# Private claim submission API

Implemented 2026-10-08 after approval of the submission rules. This is the storage/API step; student forms and administrator review/return commands follow separately.

Both endpoints require the existing session cookie and student role. Existing same-origin request checks apply. Responses use `Cache-Control: no-store`.

| Endpoint | Behavior |
| --- | --- |
| `POST /api/claims` | JSON `{ "post_id": "report-id", "evidence": "private distinguishing details" }`; returns `201` with `claim`. |
| `GET /api/claims` | Returns `{ "claims": [...] }` for the signed-in student only, newest first. Client filters cannot broaden access. |

Claim responses contain `id`, `post_id`, private `evidence`, `status` and `created_at`. The server sets identity, identifier, timestamp and Pending status; client-supplied identity/status fields cannot override them. Proof is trimmed and must contain 20–2,000 Unicode code points; NUL characters are rejected. Reports must be active Found reports belonging to another user. Submission leaves report status unchanged. Multiple students may have pending claims; one student may have only one pending claim per report.

Missing authentication returns 401; an administrator or own-report submission returns 403; invalid fields return 400; missing report returns 404; inactive/non-Found reports and duplicate claims return 409. There is no individual-claim read endpoint or administrator claim-read endpoint in this step. Report list/search responses never join private evidence or claimant identity.

Migration 2 adds the claims table, foreign keys and unique pending-claim index. Existing accounts, sessions and reports—including legacy Claimed/Returned statuses—remain unchanged. Eligibility and insertion run in one immediate transaction. Foreign keys restrict deletion of referenced users/reports; the report-delete API returns 409 when claim history exists. Recoverable archival remains a later task.

Only Pending claims are supported by this migration. Review, rejection/retry, withdrawal, approval and handover require subsequent migrations/API features. Existing administrator status editing remains available until that workflow task; a manual Claimed/Returned status is not proof of verified handover. This step does not expose a claim UI or claim review to administrators.

Tests use isolated databases and cover authentication/roles, proof validation, eligibility, trusted server fields, simultaneous duplicates, separate students' privacy, report/search exclusion, deletion protection, injected insert failure/retry, and version-one upgrade/reopen preservation.
