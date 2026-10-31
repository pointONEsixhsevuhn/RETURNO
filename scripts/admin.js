import { createInterface } from "node:readline/promises";
import { db, createUser } from "../db.js";
import { createAdminAccount } from "./admin-accounts.js";
const rl = createInterface({ input: process.stdin, output: process.stdout });
try {
  const email = process.env.ADMIN_EMAIL || (await rl.question("Admin email: "));
  const name = process.env.ADMIN_NAME || (await rl.question("Full name: "));
  const password =
    process.env.ADMIN_PASSWORD ||
    (await rl.question("Password (visible while typing, 8–128 characters): "));
  await createAdminAccount({ db, createUser, email, name, password });
  console.log("Admin account created.");
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  rl.close();
  await db.close();
}
