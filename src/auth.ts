import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { expo } from "@better-auth/expo";
import type { PrismaClient } from "./generated/prisma/client";
import type { Config } from "./config";

export function createAuth(db: PrismaClient, config: Config) {
  // A nested write makes the school profile part of the auth user's creation.
  // This client is used only by Better Auth; operator provisioning has its own roles.
  const signupDb = db.$extends({
    query: {
      user: {
        async create({ args, query }) {
          args.data.profile = { create: {
            firstName: args.data.name,
            role: "student",
            student: { create: {} },
          } };
          return query(args);
        },
      },
    },
  });
  return betterAuth({
    database: prismaAdapter(signupDb, { provider: "postgresql" }),
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.BETTER_AUTH_URL,
    trustedOrigins: config.TRUSTED_ORIGINS,
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 },
    advanced: { database: { generateId: "uuid" } },
    rateLimit: { enabled: true },
    plugins: [expo()],
  });
}
