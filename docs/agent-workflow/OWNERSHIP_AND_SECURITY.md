# Ownership and security review

This is a review procedure. Enforced product policy remains in `AGENTS.md`, `access-control.js`, API code, and the database migrations.

## Classify the files

- **Project-owned:** UI, API, tests, and maintained docs.
- **Protected:** authentication, authorization, migrations, database access, uploads, mail/secret handling, CI, and deployment configuration. Inspect the relevant owner and tests before changing these.
- **Local or ephemeral:** `.env`, `data/`, `node_modules/`, browser reports, and personal/test records. Keep them out of Git; use synthetic records and isolated temporary databases.
- **Generated or external:** confirm the generator/source before editing. Do not assume a file is generated based on its name.

## Apply RETURNO boundaries

- Trust the authenticated session for identity and role; never trust browser-supplied user IDs, roles, or hidden controls.
- Keep student and administrator permissions separate. Students create/view reports; administrators manage reports and accounts. Student claims, proof submission, and My claims are excluded.
- RETURNO uses application-enforced SQLite row scopes, not native RLS. Database file access remains outside the web permission boundary.
- Preserve parameterized SQL, allowlisted dynamic fragments, explicit response projections, session revalidation, and immutable migrations.
- Review personal-data exposure, logging, retention, account deletion cascades, and rollback behavior when relevant.
- Treat `.env`, SMTP secrets, session tokens, passwords, and verification/reset codes as sensitive. Do not print them or include them in fixtures, screenshots, traces, commits, or issue text.

## Review proposed tooling and policy

Confirm dependency source/version/license and lockfile effects before installation. Confirm CI action provenance, triggers, and minimum token permissions before changing workflows. Treat examples, skill names, JSON manifests, and proposed policies as unverified until the exact tool/version and enforcement path are established. The supplied Flower proposal has no verified CLI/schema contract and is not adopted; the repo already has its Node 24 CI workflow. Do not adopt Supabase/RLS instructions or another repository's upload/coverage thresholds for this SQLite project.

For a product/security decision, document scope, owner decision, enforcement point, verification evidence, and date in the project's normal documentation. Do not label a control enforced until it is exercised and tested.
