import { loadConfig } from "./config";
import { createDatabase } from "./db";
import { createAuth } from "./modules/auth/service";
import { createApp } from "./app";
import { createR2Storage } from "./receipt-storage";
import { startLessonReminders } from "./lesson-reminders";
import { createHealthService } from "./modules/health/service";
import { fileURLToPath } from "node:url";

const config = loadConfig();
// Watch restarts must apply newly added migrations before updated auth code runs.
// Production migrations remain an explicit deployment step.
if (config.NODE_ENV === "development") {
  const migration = Bun.spawn([process.execPath, "run", "db:migrate"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdout: "inherit",
    stderr: "inherit",
  });
  if (await migration.exited !== 0)
    throw new Error("Database migrations failed. API startup stopped; fix the migration error and restart.");
}
const db = createDatabase(config.DATABASE_URL);
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
async function stop() {
  stopReminders();
  await app.stop();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
