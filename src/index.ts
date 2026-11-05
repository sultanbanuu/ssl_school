import { loadConfig } from "./config";
import { createDatabase } from "./db";
import { createAuth } from "./modules/auth/service";
import { createApp } from "./app";
import { createR2Storage } from "./receipt-storage";
import { startLessonReminders } from "./lesson-reminders";
import { startPushDelivery } from "./push-delivery";
import { startReceiptCleanup } from "./receipt-cleanup";
import { createHealthService } from "./modules/health/service";
import { assertRuntimeDatabaseAccess } from "./database-access";

const config = loadConfig();
const db = createDatabase(config.DATABASE_URL);
try {
  await assertRuntimeDatabaseAccess(sql => db.$queryRawUnsafe(sql));
} catch (error) {
  await db.$disconnect();
  throw error;
}
if ((await createHealthService(db).readiness()).status !== "ready") {
  await db.$disconnect();
  throw new Error("Database/auth schema is not ready. Run bun run db:generate and bun run db:migrate before starting the API.");
}
const auth = createAuth(db, config);
const receipts = config.R2_ACCOUNT_ID
  ? createR2Storage({
      accountId: config.R2_ACCOUNT_ID,
      accessKeyId: config.R2_ACCESS_KEY_ID!,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY!,
      bucket: config.R2_BUCKET!,
    })
  : undefined;
const app = createApp({
  db,
  getSession: (headers) => auth.api.getSession({ headers }),
  authHandler: auth.handler,
  origins: config.TRUSTED_ORIGINS,
  receipts,
}).listen({ port: config.PORT, reusePort: false });
console.log(`SSL School API listening on port ${config.PORT}`);
const stopReminders = startLessonReminders(db);
const stopPush = startPushDelivery(db);
const stopReceiptCleanup = config.RECEIPT_CLEANUP_ENABLED && receipts ? startReceiptCleanup(db, receipts) : undefined;
async function stop() {
  stopReminders();
  stopPush();
  await stopReceiptCleanup?.();
  await app.stop();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
