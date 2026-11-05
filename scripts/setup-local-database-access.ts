// One-time conversion of this project's local owner connection to school_app.
// Refuses remote hosts and existing runtime roles; does not print passwords.
import { readFile, writeFile, access } from "node:fs/promises";
import { parse } from "dotenv";
import { Client } from "pg";
import { assertRuntimeDatabaseAccess } from "../src/database-access";

const envFile = new URL("../.env", import.meta.url);
const migrationFile = new URL("../.env.migrations", import.meta.url);
const original = await readFile(envFile, "utf8");
const env = parse(original);
if (!env.DIRECT_URL || env.DATABASE_URL !== env.DIRECT_URL) throw new Error("Expected matching local owner URLs in .env for initial conversion");
const ownerUrl = new URL(env.DIRECT_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(ownerUrl.hostname)) throw new Error("Only a local database can be converted automatically");
try { await access(migrationFile); throw new Error("Existing .env.migrations must be reviewed manually"); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }

const owner = new Client({ connectionString: env.DIRECT_URL, connectionTimeoutMillis:5000 });
const runtimeUrl = new URL(env.DATABASE_URL);
runtimeUrl.username = "school_app";
runtimeUrl.password = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
const runtime = new Client({ connectionString: runtimeUrl.toString(), connectionTimeoutMillis:5000 });
try {
  await owner.connect();
  const existing = await owner.query("SELECT FROM pg_roles WHERE rolname IN ('school_app', 'school_runtime')");
  if (existing.rowCount) throw new Error("Roles already exist");
  await owner.query("BEGIN");
  await owner.query(await readFile(new URL("sql/runtime-role.sql", import.meta.url), "utf8"));
  const statement = await owner.query("SELECT format('ALTER ROLE school_app PASSWORD %L', $1::text) AS statement", [runtimeUrl.password]);
  await owner.query(statement.rows[0].statement);
  await owner.query(await readFile(new URL("sql/runtime-permissions.sql", import.meta.url), "utf8"));
  await owner.query("COMMIT");
  await runtime.connect();
  await assertRuntimeDatabaseAccess(async sql => (await runtime.query(sql)).rows);
  await runtime.query("SELECT id FROM auth_users LIMIT 0");
  // Refuse to overwrite changes made by an editor while provisioning was running.
  if (await readFile(envFile, "utf8") !== original) throw new Error(".env changed during setup");
  await writeFile(migrationFile, `# Migration owner: tooling only, never package with the API.\nDIRECT_URL=${JSON.stringify(env.DIRECT_URL)}\n`, { flag: "wx", mode: 0o600 });
  const updated = original.split(/\r?\n/).filter(line => !/^\s*(?:export\s+)?DIRECT_URL\s*=/.test(line)).map(line => /^\s*(?:export\s+)?DATABASE_URL\s*=/.test(line) ? `DATABASE_URL=${JSON.stringify(runtimeUrl.toString())}` : line).join("\n");
  await writeFile(envFile, updated, { mode: 0o600 });
  console.log("Local database converted: .env uses school_app; .env.migrations retains the owner. Runtime access check passed.");
} catch {
  await owner.query("ROLLBACK").catch(() => {});
  console.error("Local setup failed; no credentials were printed. Review existing roles and environment files before retrying.");
  process.exitCode = 1;
} finally { await runtime.end(); await owner.end(); }
