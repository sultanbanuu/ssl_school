import "dotenv/config";
import { loadConfig } from "../src/config";
import { createDatabase } from "../src/db";
import { createR2Storage } from "../src/receipt-storage";
import { cleanupReceipts } from "../src/receipt-cleanup";
import { assertRuntimeDatabaseAccess } from "../src/database-access";

const args = process.argv.slice(2);
if (args.some(arg => arg !== "--apply")) throw new Error("Usage: bun run receipts:cleanup [--apply]. Defaults to a non-deleting preview.");
const config = loadConfig();
const dryRun = !args.includes("--apply");
if (!config.R2_ACCOUNT_ID && !dryRun) throw new Error("Receipt storage is not configured");
const db = createDatabase(config.DATABASE_URL);
try {
  await assertRuntimeDatabaseAccess(sql => db.$queryRawUnsafe(sql));
  const storage = dryRun ? { remove: async () => { throw new Error("Preview must never delete objects"); } } : createR2Storage({ accountId: config.R2_ACCOUNT_ID!, accessKeyId: config.R2_ACCESS_KEY_ID!, secretAccessKey: config.R2_SECRET_ACCESS_KEY!, bucket: config.R2_BUCKET! });
  const result = await cleanupReceipts(db, storage, { dryRun });
  console.log(JSON.stringify(result, null, 2));
  if (result.failed) process.exitCode = 1;
} catch {
  console.error("Receipt cleanup failed. Check database migrations, runtime permissions, and storage settings; no private keys or URLs are logged.");
  process.exitCode = 1;
} finally { await db.$disconnect(); }
