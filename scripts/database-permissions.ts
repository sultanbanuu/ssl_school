import "dotenv/config";
import { config } from "dotenv";
import { Client } from "pg";
import { runtimeAccessQuery } from "../src/database-access";

const action = process.argv[2];
if (!["setup", "apply", "check"].includes(action ?? "")) throw new Error("Use setup, apply, or check");
if (action !== "check") config({ path: ".env.migrations", quiet: true });
const url = action === "check" ? process.env.DATABASE_URL : process.env.DIRECT_URL;
if (!url) throw new Error(`${action === "check" ? "DATABASE_URL" : "DIRECT_URL"} is required; no credential fallback is allowed`);
const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
let permissionFailure = false;
try {
  await client.connect();
  if (action === "check") {
    const violations = (await client.query<{ reason: string }>(runtimeAccessQuery)).rows;
    if (violations.length) {
      permissionFailure = true;
      for (const { reason } of violations) console.error(`Runtime permission check: ${reason}`);
      throw new Error("Runtime permission check failed");
    }
    console.log("PASS runtime role has no schema/migration administration privileges");
  } else {
    await client.query("BEGIN");
    if (action === "setup") {
      const input = JSON.parse(await Bun.stdin.text());
      if (typeof input.password !== "string" || input.password.length < 32) throw new Error("Supply JSON on stdin with a password of at least 32 characters");
      await client.query(await Bun.file(new URL("sql/runtime-role.sql", import.meta.url)).text());
      // PostgreSQL utility statements cannot bind password parameters. Let PostgreSQL
      // quote the literal; never log the resulting statement or the input.
      const result = await client.query("SELECT format('ALTER ROLE school_app PASSWORD %L', $1::text) AS statement", [input.password]);
      await client.query(result.rows[0].statement);
    }
    await client.query(await Bun.file(new URL("sql/runtime-permissions.sql", import.meta.url)).text());
    await client.query("COMMIT");
    console.log("Runtime grants applied. Set DATABASE_URL to school_app and run bun run db:check-access.");
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  // Driver errors may contain connection details or SQL with a password.
  console.error("Database access operation failed. Check credentials, migrated schema, role ownership, and docs/database-access.md.");
  // Print only fixed explanations; driver messages can include secrets.
  if (!permissionFailure) {
    const hints: Record<string, string> = {
      ECONNREFUSED: "Connection refused. Start PostgreSQL and check the database host and port.",
      EACCES: "Connection blocked. Check terminal/sandbox permissions or firewall rules.",
      EPERM: "Connection blocked. Check terminal/sandbox permissions or firewall rules.",
      ENOTFOUND: "Database hostname could not be resolved.",
      ETIMEDOUT: "Database connection timed out. Check PostgreSQL and network access.",
      "28P01": "Password authentication failed. Check the password in the connection URL.",
      "28000": "Database authentication failed. Check the login role and server authentication rules.",
      "3D000": "The configured database does not exist.",
      "42501": "The database login lacks a required permission. Review runtime grants and migration ownership.",
      "42P01": "A required table is missing. Check that migrations were applied to this database.",
      "42704": "A required database object or role is missing. Review runtime role setup.",
    };
    const errors = error instanceof AggregateError ? [error, ...error.errors] : [error];
    const codes = new Set(errors.map(item => (item as { code?: unknown } | null)?.code));
    let explained = false;
    for (const code of codes) {
      if (typeof code === "string" && Object.hasOwn(hints, code)) {
        console.error(`${code}: ${hints[code]}`);
        explained = true;
      }
    }
    if (!explained) console.error("No recognized error code. Check the connection URL format, TLS settings, and database availability.");
    console.error(`Check ${action === "check" ? "DATABASE_URL in .env" : "DIRECT_URL in .env.migrations"}. An existing terminal environment variable takes precedence over the file.`);
  }
  process.exitCode = 1;
} finally {
  await client.end();
}
