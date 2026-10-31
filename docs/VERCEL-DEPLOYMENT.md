# Vercel and Supabase migration

## Status

The Vercel request entry point and a partial PostgreSQL adapter are present. **RETURNO is not deployable to Vercel yet.** Local development still defaults to SQLite, no Supabase schema has been applied or integration-tested, report images still use the old request payload path, and the rate limiter remains in-memory. Startup deliberately fails unless the explicit readiness flag is enabled, so an incomplete deployment cannot silently accept accounts or reports into ephemeral storage.

The selected target is Vercel Hobby with Supabase Postgres and Supabase Storage. Existing local SQLite remains the development and test backend during migration. No Supabase project, bucket, credentials, migration, or live data transfer has been created.

## Migration phases

1. **Vercel request boundary (complete):** Vercel routes `/api/*` to `api/index.js`, which exports the same request handler used by the local Node server. Local startup behavior remains unchanged. The platform adapter does not start a separate listener.
2. **Postgres persistence (implementation scaffolded, provider integration outstanding):** added a parameterized Postgres adapter, request-scoped transactions, placeholder/SQLite SQL translation, and a Supabase schema for the current tables and cascades. The API now awaits DB operations so it can use asynchronous Postgres I/O. The local SQLite suite and mocked transaction tests pass. The schema has not been applied to Supabase and SQL has not been integration-tested against a real Postgres instance. The serverless connection must use Supabase's shared transaction pooler with a small application pool and TLS; see [Supabase serverless database guidance](https://supabase.com/docs/guides/database/connecting-to-postgres/serverless-drivers). The current in-memory request limiter and email-send de-duplication also need durable/shared implementations before scaling across function instances. Preserve all existing student/admin permissions and cascades. Add isolated integration tests against a disposable Postgres schema before enabling Vercel.
3. **Private image storage (client/server flow implemented, provider integration outstanding):** in Postgres mode, the authenticated server issues a short-lived, path-scoped Supabase Storage upload grant; the browser uploads directly to the private bucket, then the server downloads, decodes, validates, resizes, strips metadata, and authorizes the object before attaching its key to a report. Report image bytes now load through an authenticated same-origin endpoint. Post/account deletion and image replacement trigger best-effort object cleanup. Vercel Functions limit request and response bodies to 4.5 MB, below RETURNO's 10 MB image cap, so this avoids sending image bytes through the function. See [Vercel Function limits](https://vercel.com/docs/functions/limitations) and [Supabase signed upload documentation](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl). The bucket must be private and capped at 10 MB; no service-role secret is sent to the browser. Configure the bucket/schema and verify CORS, signed upload, validation, authenticated retrieval, and cleanup against a disposable Supabase project before enabling deployment.
4. **Deployment verification:** add only server-side Supabase secrets in Vercel, run schema setup on a disposable project, verify registration/login/email, report CRUD and image flows, then deploy a test environment. Do not import current local accounts or reports until a separate backup/export and data-migration plan is reviewed.

## Current behavior and safety

- `api/index.js` exports the Node handler expected by Vercel.
- `vercel.json` serves the existing `public/` directory and routes API requests to that function.
- In Postgres mode, `/api/health` reports that direct image uploads are enabled. The browser obtains a server-issued upload grant and sends the file directly to Supabase; the service-role key remains server-side. In local SQLite mode, the existing data-URL upload route remains active.
- Vercel startup refuses to initialize unless `RETURNO_POSTGRES_READY=true`; leave it unset until a real Postgres integration test, direct private image flow, distributed rate limits, and security environment setup are complete. The local SQLite backend is still the default outside Vercel.
- Set `RETURNO_DATABASE=postgres` only for local testing with a disposable Postgres database. Vercel requires `RETURNO_POSTGRES_READY=true`; do not set this flag yet because Postgres integration and private image storage remain incomplete.
- SMTP configuration and secure-cookie settings still need production environment values; no secrets belong in Git.
- Supabase Free projects may pause after a week of low activity. Free quotas and eligibility must be checked in the provider dashboards before inviting users.

This scaffold is not evidence of a successful Vercel build or deployment. The next code phase is the Postgres repository and schema port.
