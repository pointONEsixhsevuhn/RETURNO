# Administrator-managed claims and returns

Product decision, 2026-10-08: the user reversed student claims. Students create and view reports; administrators manage all claim and return processing. Exclude the student claim form, My claims screen, private-proof submission and student claim API.

Administrators retain existing report editing, Claimed/Returned status changes and deletion controls. Students cannot manage these actions. Ownership verification and physical handover are managed by administrators outside the student portal. No additional administrator workflow is implemented by this reversal.

Migration 3 retires the published student claim table. Previously submitted rows remain in retired_student_claims without foreign keys blocking administrator report deletion. That table has no application API or UI. Published migration 2 stays immutable for databases that recorded its checksum. Accounts, sessions and report statuses are preserved.

Next proposed feature: administrator action history recording actor, timestamp and old/new status. Define administrator verification and handover details separately before adding more workflow fields. Student claim submission remains excluded unless explicitly requested again.