import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { expo } from "@better-auth/expo";
import type { PrismaClient } from "./generated/prisma/client";
import type { Config } from "./config";

export function createAuth(db: PrismaClient, config: Config) {
  return betterAuth({
    database: prismaAdapter(db, { provider: "postgresql" }),
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.BETTER_AUTH_URL,
    trustedOrigins: config.TRUSTED_ORIGINS,
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 },
    advanced: { database: { generateId: "uuid" } },
    rateLimit: { enabled: true },
    plugins: [expo()],
  });
}
