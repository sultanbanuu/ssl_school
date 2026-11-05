import "dotenv/config";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Loaded only by Prisma tooling, not by the running API.
config({ path: ".env.migrations", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DIRECT_URL },
});
