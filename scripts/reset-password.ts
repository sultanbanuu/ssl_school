import { createDatabase } from "../src/db";
import { resetAccountPassword } from "../src/accounts";

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL for the school database");
if (process.stdin.isTTY) throw new Error("Pipe email and password JSON through stdin; do not pass passwords as command-line arguments");

const db = createDatabase(process.env.DATABASE_URL);
try {
  console.log(JSON.stringify(await resetAccountPassword(db, JSON.parse(await Bun.stdin.text()))));
} catch {
  // Never print input, password hashes, connection strings, or raw database errors.
  console.error("Password reset failed. Check input, database availability, and whether the password account exists.");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
