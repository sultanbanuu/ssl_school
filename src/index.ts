import { loadConfig } from "./config";
import { createDatabase } from "./db";
import { createAuth } from "./auth";
import { createApp } from "./app";
import { createR2Storage } from "./receipt-storage";

const config = loadConfig();
const db = createDatabase(config.DATABASE_URL);
const auth = createAuth(db, config);
const receipts = config.R2_ACCOUNT_ID ? createR2Storage({ accountId: config.R2_ACCOUNT_ID,
  accessKeyId: config.R2_ACCESS_KEY_ID!, secretAccessKey: config.R2_SECRET_ACCESS_KEY!, bucket: config.R2_BUCKET! }) : undefined;
const app = createApp({ db, getSession: (headers) => auth.api.getSession({ headers }), authHandler: auth.handler, origins: config.TRUSTED_ORIGINS, receipts }).listen(config.PORT);
console.log(`SSL School API listening on port ${config.PORT}`);
async function stop() { await app.stop(); await db.$disconnect(); process.exit(0); }
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
