
# Student password recovery

The student login offers Forgot password? ? registered email ? emailed six-digit code ? new password and confirmation ? normal login. The same configured SMTP sender delivers reset codes and a password-change notification. No password is emailed. Existing passwords remain unchanged until a valid code is supplied; all sessions for the account are revoked on success. No automatic login occurs after reset.

Codes are cryptographically random, hashed in private storage, single-use, valid for 10 minutes and limited to five attempts. Requests are throttled per IP; resends are limited to one per minute per account. Request responses are identical for unknown/student/admin emails, and SMTP runs outside the response path. Failed delivery invalidates the associated challenge, logs a generic error without credentials or codes, and leaves the password unchanged. If no email arrives, check spam and contact the administrator.

Public recovery applies only to students. Admin recovery continues through the local administrator recovery CLI. A reset challenge is bound to the account's current password hash and cannot survive another password change, an admin-role promotion or account deletion. Password update, challenge consumption and session revocation commit together or roll back together. Migration 5 adds private recovery storage; it is excluded from API projections and cascades on account deletion.

Automated tests use isolated databases and an in-memory email transport. Real Gmail receipt still needs a user inbox check. See [OWASP Forgot Password guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
