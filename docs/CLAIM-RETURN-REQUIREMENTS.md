# Claim and return requirements

Draft for product review, 2026-10-08. The user approved the core workflow: students submit private ownership proof on Found reports, administrators approve claims and separately confirm physical handover. Student report-editing permissions stay unchanged. The user also approved the submission eligibility, proof limits, duplicate/competing-pending rules and preservation of legacy outcomes. Private submission/own-claim reads are implemented; review, handover and archival remain later tasks.

## Existing behavior

Students create and view Lost/Found reports. Administrators edit reports, set Lost/Found/Claimed/Returned statuses, and delete reports. Status changes currently do not require a claimant, proof, physical handover, or an audit event. Active status must match report type; a status update to Lost or Found currently changes that type. Historical records must not be treated as verified claims merely because their status is Claimed or Returned.

## Proposed first workflow

An authenticated student submits private ownership details for an active Found report. Details should describe a distinguishing feature omitted from the public report. Do not request identity-document uploads in the first version. The administrator verifies the details and, where needed, checks identity in person. Approval reserves the item; it does not establish physical return. An administrator records the completed handover separately.

Lost reports remain searchable reports of missing property. Their authors do not claim their own Lost reports. Linking a Lost report to a Found report is a later feature. A finder reporting an item does not automatically own it and cannot claim their own Found report in this first workflow.

Student report editing/deletion and administrator registration rules stay as currently implemented. No chat, notifications, automatic matching, or public claimant identity is included.

## Decisions requiring agreement

| Decision | Proposed default |
| --- | --- |
| Who records requests? | Approved: students submit private claims; administrators review and record handover. |
| Eligible reports | Active Found reports only; claimant must differ from reporter. Lost-report recovery requires a separate future design. |
| Proof | Required private text, 20–2,000 trimmed characters; optional in-person verification recorded as a short administrator note. No document uploads. |
| Rejected requests | Reason required. Student may submit a new request with additional evidence; previous requests remain in history. One live request per student/report. |
| Competing claims | Multiple pending requests permitted. Only one approved claim per report; approval atomically rejects other pending requests with a standard reason. |
| Withdrawal/reversal | Student can withdraw their pending request. Administrator can revoke approval before handover with a reason, reopening the Found report; rejected competitors may resubmit. |
| Return confirmation | Administrator records handover to the approved claimant with a required note. Returned reports cannot be reopened through normal status editing. |
| Visibility | Student sees their own evidence, outcome and reasons. Administrators see claim evidence and history. Public report readers see status only. |
| Archival | Administrator archives/restores instead of permanent deletion. Archived reports accept no new claims or handovers; archive pending claims as canceled with reason. Reject archival while approval awaits handover until approval is revoked. |
| Retention | Retain workflow records during prototype use; campus must approve a retention/deletion policy before public launch. No retention period is assumed here. |

## Proposed state rules

Report type stays Lost or Found independently of lifecycle status. Changing type after a claim exists is rejected; corrections require an explicit future administrative procedure. Workflow commands become the only way to enter Claimed/Returned for new verified workflows; editing report fields must not bypass these rules.

| Current state | Action and actor | Result |
| --- | --- | --- |
| Found, no approved claim | Student submits claim | Pending claim; report remains Found. |
| Pending claim | Claimant withdraws | Withdrawn; report unchanged. |
| Pending claim | Administrator rejects with reason | Rejected; report unchanged. |
| Found + pending claim | Administrator approves after verification | Approved claim; report Claimed; other pending claims rejected atomically. |
| Claimed + approved claim | Administrator revokes with reason | Revoked claim; report Found. |
| Claimed + approved claim | Administrator confirms handover | Returned claim and report, with actor/time/note recorded atomically. |
| Returned | Repeat handover, new approval or normal reopen | Reject without changes; show current outcome. |

Claims on archived or non-Found reports are rejected. If two administrators approve competing requests concurrently, exactly one succeeds and the other receives a conflict without partial writes. Repeated submissions must not create duplicate live claims. Requests must authenticate and enforce roles on the server; identifiers supplied by the browser do not establish identity or ownership.

## Records and history

Plan a versioned migration before introducing claims, audit events or archival fields. Preserve existing users, sessions, reports and statuses. Existing Claimed/Returned records remain legacy outcomes with unknown claimant/verification; never fabricate evidence or handover events. Their correction or enrollment into a verified workflow needs a separately agreed policy.

Store claims with report/claimant identifiers, private evidence, state and timestamps. Record review actor, reason, approval/revocation/handover timestamps as applicable. Server-generated audit events record actor, action, prior/new state and timestamp in the same transaction as the change. Public list/search responses must exclude private evidence and audit notes. Archived reports are excluded from student feed/search; administrators can inspect and restore them. History is not editable through normal UI/API operations.

## Acceptance criteria

1. Unauthorized users cannot submit or inspect claims; students cannot access another student's claim by guessing its identifier or through list/search responses. Students cannot approve, reject, return, archive or restore reports.
2. Valid claims on eligible Found reports persist with the signed-in claimant and server timestamps. Missing/oversized evidence, own-report claims, duplicate live requests, archived reports and invalid states are rejected without writes.
3. Rejection and withdrawal preserve history. A new request after rejection uses a new identifier and requires fresh submission. Required reasons are validated.
4. Approval sets the report to Claimed and resolves competing requests in one transaction. Concurrent approvals and injected database failures leave no conflicting approval or partial state/history.
5. Revocation reopens a Found report and preserves the original approval record. Handover requires an approved claim and administrator note; one transaction records return and history. Repeated return cannot create another handover event.
6. Existing edit/status endpoints cannot bypass claim transitions. Report type remains unchanged by approval/return; legacy records retain their original data and are identified as unverified history.
7. Archival and restoration preserve reports and audit history. Archived reports disappear from public feed/search and cannot accept workflow actions; pending claims are canceled atomically under the agreed archive rule.
8. Student and administrator pages expose clear pending, rejected, approved and returned outcomes. Expired sessions, validation errors, network retry and conflicting updates preserve entered evidence where appropriate without exposing another user's information.
9. Migration and restart tests use isolated databases and include legacy records. API tests cover role/privacy boundaries, rollback and concurrent approval. Browser tests exercise claim/rejection/resubmission/approval/handover with separate accounts, keyboard controls and narrow viewports.

## Delivery sequence after agreement

Each item receives its own tested commit and GitHub push:

1. Versioned migration runner and preservation/rollback checks, as the prerequisite for workflow tables.
2. Claim storage and private submission/own-claim reads, API validation and privacy tests.
3. Student claim form/list with keyboard, retry and session handling; browser coverage.
4. Administrator review and approval/rejection with transactional history and concurrency checks.
5. Revocation and verified handover, replacing unrestricted workflow-status changes without silently rewriting legacy records.
6. Recoverable archival/restoration and administrator history views.

The migration runner and private submission API are complete. Next: student claim form/list. Confirm the remaining review, retry, reversal and archival defaults before implementing those actions. Core student claim submission is approved; no broader student report-management permissions are authorized.
