import { createInterface } from "node:readline/promises";
import { db, hashPassword } from "../db.js";

const rl = createInterface({ input: process.stdin, output: process.stdout });
try {
  const admins = db
    .prepare(
      "SELECT id,email,full_name FROM users WHERE role=? ORDER BY created_at,email",
    )
    .all("admin");
  if (!admins.length)
    throw Error(
      "No administrator accounts exist in this database. Create one with npm run admin.",
    );

  console.log("Administrator accounts:");
  for (const admin of admins)
    console.log(`- ${admin.full_name} <${admin.email}>`);

  const email = (await rl.question("Admin email to reset: "))
    .trim()
    .toLowerCase();
  const admin = admins.find((item) => item.email.toLowerCase() === email);
  if (!admin)
    throw Error("That email is not an administrator in this database.");

  const password = await rl.question(
    "New password (visible while typing, 8–128 characters): ",
  );
  const confirmation = await rl.question("Confirm new password: ");
  if (password.length < 8 || password.length > 128)
    throw Error("Password must be 8–128 characters.");
  if (password !== confirmation) throw Error("Passwords do not match.");

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(
      hashPassword(password),
      admin.id,
    );
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(admin.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  console.log(
    `Password reset for ${admin.email}. Log in with the new password.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  rl.close();
  db.close();
}
