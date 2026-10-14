# Registration email verification

New public registrations receive a six-digit email code. No user or session is created until confirmation. Codes expire after 10 minutes, allow at most five attempts, and cannot be requested again for one minute. Registration resubmission sends a new code. Passwords use scrypt; verification codes are stored as purpose-separated HMAC-SHA-256 digests using `RETURNO_CODE_PEPPER`, which must be kept outside SQLite. Expired pending rows are removed on subsequent successful registrations. Pending accounts are absent from administrator user lists. Public registration always creates students.

This verifies email ownership during signup, not a second factor on each login. Gmail addresses work; other valid email addresses also work. Existing accounts and administrator-created accounts retain their current login behavior and are not retroactively labeled email-verified.

## Gmail sender setup

1. Use a dedicated Google account for RETURNO and enable Google 2-Step Verification.
2. Generate a Google app password if the account supports it. Use that app password, not its normal password.
3. Generate a separate 32-byte code pepper in a terminal: `node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('hex'))"`.
4. Copy `.env.example` to `.env` locally and replace the sender placeholders and `RETURNO_CODE_PEPPER` with the generated 64-character hex value. Never reuse the Gmail password as the pepper. Do not commit `.env` or share any secret in chat. The From address should match the sender.
5. Start with `npm start` from the repository directory. Startup requires a valid pepper, loads the optional local `.env` file, and lets host environment variables take precedence.
6. Register a test account, check its actual Gmail inbox/spam folder, enter the code, then log out and log in again.

Keep the pepper in a secret manager or protected environment configuration, separately from SQLite backups. Use the same value across restarts and application instances. Rotating it invalidates active email codes; users must request new codes. Legacy unkeyed codes are discarded when submitted after upgrading.

Production hosting should configure these values as environment secrets. SMTP uses encrypted port 465 or STARTTLS-required port 587 with certificate verification. Missing credentials or failed SMTP delivery causes registration to return an actionable error, without silently allowing an unverified account. Never expose a test inbox endpoint or log verification codes.

Automated tests use an injected in-memory email transport and isolated databases. They verify the application flow, not Google SMTP delivery. Real sending still requires local credentials and a live inbox check.

References: [Nodemailer SMTP](https://nodemailer.com/smtp), [Google app passwords](https://support.google.com/mail/answer/185833).

If registration opens Home immediately instead of asking for a code, stop the old RETURNO process with Ctrl+C and start it again with `npm start`. Backend changes and saved SMTP credentials require a restart. Direct `node scripts/start.js` also loads the project `.env`, regardless of the terminal's working directory.
