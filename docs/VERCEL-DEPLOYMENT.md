# Vercel and Supabase migration

## Status

The Vercel request entry point and static output routing are scaffolded. **RETURNO is not deployable to Vercel yet.** The API still uses SQLite, which is not durable or shared across Vercel function instances. Startup deliberately fails when Vercel sets `VERCEL=1` so that an incomplete deployment cannot silently accept accounts or reports into an ephemeral database.

The selected target is Vercel Hobby with Supabase Postgres and Supabase Storage. Existing local SQLite remains the development and test backend during migration. No Supabase project, bucket, credentials, migration, or live data transfer has been created.

## Migration phases

1. **Vercel request boundary (scaffolded):** Vercel routes `/api/*` to `api/index.js`, which exports the same request handler used by the local Node server. Local startup behavior remains unchanged. The platform adapter does not start a separate listener.
2. **Postgres persistence:** port the schema, queries, transactions, session and verification-code state, and application-level authorization to Supabase Postgres. Use parameterized queries and transaction-pool-compatible connections. Preserve all existing student/admin permissions and cascades. Add isolated integration tests against a disposable Postgres schema.
3. **Private image storage:** migrate report image bytes from the SQLite `posts.image` column to a private Supabase Storage bucket. Preserve image validation and authorization; do not publish report images through a public bucket. Test upload, replacement, deletion cascades, and signed or authenticated delivery.
4. **Deployment verification:** add only server-side Supabase secrets in Vercel, run schema setup on a disposable project, verify registration/login/email, report CRUD and image flows, then deploy a test environment. Do not import current local accounts or reports until a separate backup/export and data-migration plan is reviewed.

## Current behavior and safety

- `api/index.js` exports the Node handler expected by Vercel.
- `vercel.json` serves the existing `public/` directory and routes API requests to that function.
- The local SQLite backend refuses to initialize when `VERCEL=1`. This guard is intentional until the Postgres adapter is complete.
- SMTP configuration and secure-cookie settings still need production environment values; no secrets belong in Git.
- Supabase Free projects may pause after a week of low activity. Free quotas and eligibility must be checked in the provider dashboards before inviting users.

This scaffold is not evidence of a successful Vercel build or deployment. The next code phase is the Postgres repository and schema port.
