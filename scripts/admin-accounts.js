export async function createAdminAccount({ db, createUser, email, name, password }) {
  const normalizedEmail = email.trim().toLowerCase();
  const fullName = name.trim();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
    normalizedEmail.length > 254 ||
    !fullName ||
    fullName.length > 100 ||
    password.length < 8 ||
    password.length > 128
  )
    throw Error("Invalid account details.");
  if (await db.prepare("SELECT id FROM users WHERE email=?").get(normalizedEmail))
    throw Error("Email already exists.");
  await createUser(normalizedEmail, fullName, password, "admin");
  return normalizedEmail;
}

export async function resetAdminPassword({
  db,
  email,
  password,
  confirmation,
  hashPassword,
  withTransaction,
}) {
  const admins = await db
    .prepare("SELECT id,email,full_name FROM users WHERE role=? ORDER BY created_at,email")
    .all("admin");
  if (!admins.length)
    throw Error("No administrator accounts exist in this database. Create one with npm run admin.");

  const normalizedEmail = email.trim().toLowerCase();
  const admin = admins.find((item) => item.email.toLowerCase() === normalizedEmail);
  if (!admin) throw Error("That email is not an administrator in this database.");
  if (password.length < 8 || password.length > 128)
    throw Error("Password must be 8–128 characters.");
  if (password !== confirmation) throw Error("Passwords do not match.");

  await withTransaction(async () => {
    await db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(
      hashPassword(password), admin.id,
    );
    await db.prepare("DELETE FROM sessions WHERE user_id=?").run(admin.id);
  });
  return admin.email;
}
