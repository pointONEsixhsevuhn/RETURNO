import pg from "pg";
import nodemailer from "nodemailer";
import { postgresSslOptions } from "../postgres-ssl.js";
import { assertCodePepper } from "../verification-codes.js";
import { validateStorageConfiguration } from "../supabase-storage.js";

const required = [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_STORAGE_BUCKET",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "MAIL_FROM",
];
const missing = required.filter((name) => !process.env[name]);
if (!process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY)
  missing.push("SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)");
if (missing.length) {
  console.error(`Missing local deployment settings: ${missing.join(", ")}`);
  console.error("This check reads .env only; add the same server-side secrets to Vercel separately.");
  process.exitCode = 1;
} else {
  try {
    try { assertCodePepper(); }
    catch {
      throw Object.assign(new Error("Set RETURNO_CODE_PEPPER to a stable 64-character hex secret."), { readiness: true });
    }
    const supabaseUrl = new URL(process.env.SUPABASE_URL);
    if (supabaseUrl.protocol !== "https:")
      throw Object.assign(new Error("Supabase URL must use HTTPS."), { readiness: true });
    try { validateStorageConfiguration(); }
    catch { throw Object.assign(new Error("SUPABASE_SECRET_KEY must be a server-only sb_secret_ key or valid legacy service-role key; replace it in .env and Vercel."), { readiness: true }); }
    console.log("Local deployment secrets: PASS (values not displayed)");

    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      ssl: postgresSslOptions(),
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
    });
    try {
      const expectedTables = [
        "users", "sessions", "posts", "retired_student_claims",
        "pending_registrations", "password_resets", "account_deletion_requests",
        "policy_acceptances", "item_outcome_notifications", "request_rate_limits",
        "email_delivery_reservations",
      ];
      const tables = await pool.query(
        `SELECT name, to_regclass('public.' || name) IS NOT NULL AS present
         FROM unnest($1::text[]) AS name`,
        [expectedTables],
      );
      const absent = tables.rows.filter((row) => !row.present).map((row) => row.name);
      if (absent.length)
        throw Object.assign(new Error(`Required tables missing: ${absent.join(", ")}`), { readiness: true });

      const security = await pool.query(
        `SELECT c.relname, c.relrowsecurity AS rls_enabled,
          has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
          has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select
         FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,
        [expectedTables],
      );
      const insecure = security.rows.filter((row) =>
        !row.rls_enabled || row.anon_select || row.authenticated_select,
      );
      if (security.rows.length !== expectedTables.length || insecure.length)
        throw Object.assign(new Error("Database row-security checks failed."), { readiness: true });

      const proofColumn = await pool.query(
        `SELECT EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='item_outcome_notifications'
           AND column_name='proof_image') AS present`,
      );
      if (!proofColumn.rows[0].present)
        throw Object.assign(new Error("Migration 004 proof_image column is missing."), { readiness: true });

      const bucket = await pool.query(
        "SELECT public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id=$1",
        [process.env.SUPABASE_STORAGE_BUCKET],
      );
      const imageBucket = bucket.rows[0];
      const allowedTypes = [...(imageBucket?.allowed_mime_types || [])].sort().join(",");
      if (!imageBucket || imageBucket.public || Number(imageBucket.file_size_limit) !== 10485760 ||
        allowedTypes !== "image/jpeg,image/png,image/webp")
        throw Object.assign(new Error("Private image bucket settings are missing or incorrect."), { readiness: true });

      console.log("Supabase database connection: PASS (verified TLS)");
      console.log(`Postgres schema and row-security checks: PASS (${expectedTables.length} tables)`);
      console.log("Private 10 MB image bucket check: PASS");
      const port = Number(process.env.SMTP_PORT || 465);
      if (![465, 587].includes(port))
        throw Object.assign(new Error("SMTP_PORT must be 465 or 587."), { readiness: true });
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        requireTLS: true,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });
      try {
        await transport.verify();
        console.log("SMTP connection/authentication: PASS (no email sent)");
      } catch {
        throw Object.assign(new Error("SMTP connection/authentication failed; verify the sender settings in Vercel."), { readiness: true });
      } finally {
        transport.close();
      }
      console.log("Set COOKIE_SECURE=true in Vercel; this local check cannot inspect Vercel environment settings.");
      console.log("This read-only preflight does not deploy to Vercel.");
    } finally {
      await pool.end();
    }
  } catch (error) {
    console.error(error.readiness ? error.message : "Readiness check failed; connection details are withheld to protect credentials.");
    process.exitCode = 1;
  }
}
