import { createInterface } from "node:readline/promises";
import { db, createUser } from "../db.js";
const rl = createInterface({ input: process.stdin, output: process.stdout });
try {
  const email = (
    process.env.ADMIN_EMAIL || (await rl.question("Admin email: "))
  )
    .trim()
    .toLowerCase();
  const name = (
    process.env.ADMIN_NAME || (await rl.question("Full name: "))
  ).trim();
  const password =
    process.env.ADMIN_PASSWORD ||
    (await rl.question("Password (visible while typing, 8–128 characters): "));
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    !name ||
    name.length > 100 ||
    password.length < 8 ||
    password.length > 128
  )
    throw Error("Invalid account details.");
  if (db.prepare("SELECT id FROM users WHERE email=?").get(email))
    throw Error("Email already exists.");
  createUser(email, name, password, "admin");
  console.log("Admin account created.");
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  rl.close();
  db.close();
}
