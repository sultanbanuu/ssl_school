import { createDatabase } from "../src/db";
import { provisionAccount } from "../src/accounts";

if (!process.env.DATABASE_URL)
  throw new Error("Set DATABASE_URL for the new database");
if (process.stdin.isTTY)
  throw new Error(
    "Pipe account JSON through stdin; do not pass passwords as command-line arguments",
  );
const db = createDatabase(process.env.DATABASE_URL);
try {
  const input = JSON.parse(await Bun.stdin.text());
  console.log(JSON.stringify(await provisionAccount(db, input)));
} catch (error) {
  console.error(
    "Account provisioning failed. Check input, database availability, and whether the email already exists.",
  );
  const failure = error as {
    name?: string;
    code?: string;
    issues?: { path: PropertyKey[]; message: string }[];
  };

  console.error({
    type: failure.name,
    code: failure.code,
    validation: failure.issues?.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  });
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
