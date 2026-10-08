import nodemailer from "nodemailer";

let transport;
// Inject a local transport in isolated tests; never expose an inbox through HTTP.
export function setMailTransport(value) {
  transport = value;
}
export async function sendVerification(email, code) {
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
    subject: "Confirm your RETURNO email address",
    text: `Your RETURNO verification code is ${code}.\n\nEnter it on the registration screen within 10 minutes to confirm your email. Do not share this code. If you did not register, ignore this message.`,
  });
  if (result.rejected?.length) throw new Error("Email delivery rejected.");
}
