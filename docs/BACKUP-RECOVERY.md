# RETURNO backup and recovery

RETURNO uses Supabase Postgres and a private Supabase Storage bucket when deployed on Vercel. The local `npm run db:backup` command backs up only local SQLite and is **not** a backup of deployed data.

## What this repository prepares

`.github/workflows/supabase-backup.yml` is a daily GitHub Actions job (18:17 UTC) that exports the Supabase database, copies the configured Storage bucket, checks the dump files, encrypts the complete bundle with age, and uploads only the encrypted file as a GitHub artifact. Artifacts expire after 30 days. Download each backup you need to retain longer and keep it in a separate private location. A failed or skipped workflow is not a successful backup; check the Actions run after setup and periodically thereafter.

The backup includes database roles, schema and data plus the files in the configured bucket. It does not include Vercel environment variables, the RETURNO code pepper, Supabase project settings, or GitHub secret values. Keep those secrets in their respective secret managers and maintain the same pepper during recovery so existing account credentials/codes continue to work.

Supabase Free currently does not provide automatic database backups. Supabase database backups also omit Storage file contents. This workflow addresses both by exporting the database and copying Storage separately. Supabase's own daily backup feature is available on paid plans; review the current plan before relying on provider-managed backup coverage. References: [Supabase database backups](https://supabase.com/docs/guides/platform/backups), [Supabase CLI backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), and [Supabase Storage S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication).

## One-time setup

1. In the GitHub repository, open **Settings → Secrets and variables → Actions**.
2. Create these **repository secrets**. Do not place them in source files or workflow logs:

   | Secret                          | Value                                                                                                                                                   |
   | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `SUPABASE_BACKUP_DATABASE_URL`  | Supabase **Session pooler** connection string (port 5432), with the current database password URL-encoded. Do not use the app's transaction-pooler URL. |
   | `SUPABASE_S3_ACCESS_KEY_ID`     | Server-side S3 access key created under Supabase Storage → Configuration → S3.                                                                          |
   | `SUPABASE_S3_SECRET_ACCESS_KEY` | Matching server-side S3 secret. It grants broad Storage access; keep it private.                                                                        |

3. Create these **repository variables**:

   | Variable                       | Value                                                                                                                                     |
   | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
   | `SUPABASE_S3_ENDPOINT`         | Exact HTTPS endpoint shown in Supabase Storage → Configuration → S3, typically `https://<project-ref>.storage.supabase.co/storage/v1/s3`. |
   | `SUPABASE_S3_REGION`           | Exact region shown on that same S3 settings page.                                                                                         |
   | `SUPABASE_STORAGE_BUCKET`      | The private RETURNO bucket name, normally `retorno-images`.                                                                               |
   | `RETURNO_BACKUP_AGE_RECIPIENT` | Public age recipient string beginning `age1`.                                                                                             |

4. Install age locally from its official release instructions. Generate a key pair with `age-keygen -o retorno-backup-key.txt`. Keep `retorno-backup-key.txt` in a password manager or encrypted offline storage, **outside this repository**. Run `age-keygen -y retorno-backup-key.txt` and save the resulting public `age1...` recipient as the GitHub variable above. Losing the private key makes every encrypted archive unrecoverable. Never add the private key to GitHub Actions secrets or the repository.
5. Open **Actions → Encrypted Supabase backup → Run workflow** and run it once. Confirm it finishes successfully and creates an artifact named `retorno-encrypted-backup-…`. Download it and keep a copy separate from GitHub. Configure repository Actions permissions to allow workflows to run if GitHub currently blocks them.
6. Confirm a scheduled run succeeds the next day. GitHub scheduled workflows can be delayed or disabled for inactive repositories, so check the Actions page regularly; this is monitoring, not a guarantee of execution.

The workflow uses the official Supabase CLI pinned to version `3.0.0`, rclone's S3 client, and age encryption. Database command output is captured instead of printed because provider diagnostics can include connection details. Do not run this workflow from an untrusted fork or change its trigger to accept user-controlled inputs.

## Restore drill and incident recovery

Never test recovery by overwriting the current production project. Perform the first drill in a separate, access-restricted Supabase project and delete that test project when verification is complete. Restoring real user records to a test project creates another copy of personal data, so limit access and retention.

1. Download the encrypted artifact from **Actions → the successful backup run → Artifacts** before its 30-day expiry. Confirm the supplied `.sha256` file matches the encrypted archive with `sha256sum -c retorno-backup.tar.gz.age.sha256` (or an equivalent SHA-256 utility).
2. Install age and decrypt using the separately stored private key: `age --decrypt --identity retorno-backup-key.txt --output retorno-backup.tar.gz retorno-backup.tar.gz.age`.
3. Extract the archive to a new, private folder and verify every payload file: `tar -xzf retorno-backup.tar.gz -C restore-check`, then change into `restore-check/retorno-backup` and run `sha256sum -c SHA256SUMS`.
4. Create a separate Supabase project. Restore the database dumps using the current [Supabase CLI restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), adapting it to the extracted `roles.sql`, `schema.sql`, and `data.sql`. Review the procedure carefully before running it; the SQL contains real account and report data. Recreate the private `retorno-images` bucket with the 10 MiB limit and PNG/JPEG/WebP MIME allowlist defined by `migrations/postgres/001-retorno-schema.sql`.
5. Configure an S3 client for the test project's Storage endpoint and copy the extracted `storage/` directory into its `retorno-images` bucket. Do not use a sync command that deletes destination objects. Check several known reports and confirm their image paths resolve; also check the database contains expected table shapes and nonzero/expected row totals without exposing student data in logs.
6. Record the date, backup artifact, database restore result, Storage object count, image check, and elapsed time. Delete the drill project and local plaintext extraction after the review. Repeat this drill at least quarterly and after a major schema/storage change.

For a real incident, first preserve the current project state and determine the restore point. Restoring changes user data and can cause downtime; coordinate the cutover, apply the recovered database and Storage together, then update the Vercel production environment to the recovered project's connection and Storage settings and redeploy. Do not delete the old Supabase project until the recovered system is checked and the owner approves the cutover.

## Recovery targets and limitations

- Scheduled cadence: one backup per day; GitHub scheduling may be delayed. The practical recovery point is the latest successful backup, not necessarily the most recent day.
- Online artifact retention: 30 days. Download archives for longer retention to a separate private location.
- Recovery time: not yet measured; a quarterly restore drill is required to establish it.
- This repository has not executed the new workflow against the production Supabase project. Backups are **not active** until the repository secrets/variables are configured and a successful run is verified.
- The existing SQLite backup/verify/restore scripts still apply only to local SQLite installations.
