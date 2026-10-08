# Registration email verification

New public registrations receive a six-digit email code. No user or session is created until confirmation. Codes expire after 10 minutes, allow at most five attempts, and cannot be requested again for one minute. Registration resubmission sends a new code. Codes and passwords are hashed in pending storage; expired pending rows are removed on subsequent successful registrations. Pending accounts are absent from administrator user lists. Public registration always creates students.

This verifies email ownership during signup, not a second factor on each login. Gmail addresses work; other valid email addresses also work. Existing accounts and administrator-created accounts retain their current login behavior and are not retroactively labeled email-verified.

## Gmail sender setup

1. Use a dedicated Google account for RETURNO and enable Google 2-Step Verification.
2. Generate a Google app password if the account supports it. Use that app password, not its normal password.
3. Copy `.env.example` to `.env` locally and replace the sender placeholders. Do not commit `.env` or share the password in chat. The From address should match the sender.
4. Start with `npm start` from the repository directory. It loads the optional local `.env` file; environment variables already configured by your host take precedence.
5. Register a test account, check its actual Gmail inbox/spam folder, enter the code, then log out and log in again.

Production hosting should configure these values as environment secrets. SMTP uses encrypted port 465 or STARTTLS-required port 587 with certificate verification. Missing credentials or failed SMTP delivery causes registration to return an actionable error, without silently allowing an unverified account. Never expose a test inbox endpoint or log verification codes.

Automated tests use an injected in-memory email transport and isolated databases. They verify the application flow, not Google SMTP delivery. Real sending still requires local credentials and a live inbox check.

References: [Nodemailer SMTP](https://nodemailer.com/smtp), [Google app passwords](https://support.google.com/mail/answer/185833).
