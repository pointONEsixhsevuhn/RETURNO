import { createInterface } from "node:readline/promises";
import { db, hashPassword, withDatabaseTransaction } from "../db.js";
import { resetAdminPassword } from "./admin-accounts.js";

const rl = createInterface({ input: process.stdin, output: process.stdout });
try {
  const admins = await db
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

  const email = await rl.question("Admin email to reset: ");
  const password = await rl.question(
    "New password (visible while typing, 8-128 characters): ",
  );
  const confirmation = await rl.question("Confirm new password: ");
  const normalizedEmail = await resetAdminPassword({
    db,
    email,
    password,
    confirmation,
    hashPassword,
    withTransaction: withDatabaseTransaction,
  });
  console.log(`Password reset for ${normalizedEmail}. Log in with the new password.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  rl.close();
  await db.close();
}
