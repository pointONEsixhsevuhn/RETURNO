// Optional reference data only. Run on a fresh database to reproduce the sample cards.
import { randomUUID } from "node:crypto";
import { db, createUser } from "../db.js";
if (db.prepare("SELECT COUNT(*) AS n FROM users").get().n) {
  console.error(
    "Demo requires a fresh database. Existing records were not changed.",
  );
  process.exit(1);
}
const password = "RetornoDemo123!";
db.exec("BEGIN");
try {
  const student = createUser("student@example.com", "Student", password);
  createUser("admin@example.com", "Admin", password, "admin");
  const names = ["Kasandra", "Princess Ika", "Jie", "Caren", "Javie", "Diana"];
  const statuses = ["Claimed", "Returned", "Found", "Claimed", "Lost", "Found"];
  const insert = db.prepare(
    "INSERT INTO posts(id,user_id,kind,status,item_name,event_at,location,description) VALUES(?,?,?,?,?,?,?,?)",
  );
  names.forEach((name, i) => {
    const id = createUser(
      name.toLowerCase().replaceAll(" ", "") + "@example.com",
      name,
      password,
    );
    insert.run(
      randomUUID(),
      id,
      i === 1 || i === 4 ? "Lost" : "Found",
      statuses[i],
      "",
      "",
      "",
      "",
    );
  });
  // The student's three cards from reference 7; real posts use required fields.
  for (const status of ["Found", "Lost", "Claimed"])
    insert.run(
      randomUUID(),
      student,
      status === "Lost" ? "Lost" : "Found",
      status,
      "",
      "",
      "",
      "",
    );
  db.exec("COMMIT");
  console.log(
    "Demo created. Student: student@example.com | Admin: admin@example.com | Password: " +
      password,
  );
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
} finally {
  db.close();
}
