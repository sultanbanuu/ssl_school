import { loadConfig } from "./config";
import { createDatabase } from "./db";
import { createAuth } from "./auth";
import { createApp } from "./app";

const config = loadConfig();
const db = createDatabase(config.DATABASE_URL);
const auth = createAuth(db, config);
const app = createApp({ db, getSession: (headers) => auth.api.getSession({ headers }), authHandler: auth.handler, origins: config.TRUSTED_ORIGINS }).listen(config.PORT);
console.log(`SSL School API listening on port ${config.PORT}`);
async function stop() { await app.stop(); await db.$disconnect(); process.exit(0); }
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
