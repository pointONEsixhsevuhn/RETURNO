import nodemailer from "nodemailer";

let transport;
// Inject a local transport in isolated tests; never expose an inbox through HTTP.
export function setMailTransport(value) {
  transport = value;
}
async function sendEmail(email, subject, text) {
  if (!transport) {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, MAIL_FROM } =
      process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !MAIL_FROM)
      throw new Error("Email delivery is not configured.");
    const port = Number(SMTP_PORT || 465);
    if (![465, 587].includes(port))
      throw new Error("Use SMTP port 465 or 587.");
    transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      requireTLS: true,
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  const result = await transport.sendMail({
    from: process.env.MAIL_FROM || "RETURNO <no-reply@retorno.example>",
    to: email,
    subject,
    text,
  });
  if (result.rejected?.length) throw new Error("Email delivery rejected.");
}

export function sendVerification(email, code) {
  return sendEmail(email, "Confirm your RETURNO email address", `Your RETURNO verification code is ${code}.\n\nEnter it on the registration screen within 10 minutes to confirm your email. Do not share this code. If you did not register, ignore this message.`);
}
export function sendPasswordReset(email, code) {
  return sendEmail(email, "Reset your RETURNO password", `Your RETURNO password reset code is ${code}.\n\nEnter it on the password recovery screen within 10 minutes. Do not share this code. If you did not request a password reset, ignore this email; your password has not changed.`);
}
export function sendPasswordChanged(email) {
  return sendEmail(email, "Your RETURNO password was changed", "Your RETURNO password has been reset. All existing sessions have been signed out. If you did not make this change, contact the administrator immediately. Your password is never included in emails.");
}
