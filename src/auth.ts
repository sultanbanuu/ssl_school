import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { expo } from "@better-auth/expo";
import type { PrismaClient } from "./generated/prisma/client";
import type { Config } from "./config";
import { signupName, birthDateSchema, learningTimeSchema } from "./signup";

export function createAuth(db: PrismaClient, config: Config) {
  // A nested write makes the school profile part of the auth user's creation.
  // This client is used only by Better Auth; operator provisioning has its own roles.
  const signupDb = db.$extends({
    query: {
      user: {
        async create({ args, query }) {
          args.data.profile = { create: {
            firstName: args.data.firstName || args.data.name,
            lastName: args.data.lastName,
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
    user: { additionalFields: {
      firstName: { type: "string", required: true, validator: { input: signupName } },
      lastName: { type: "string", required: true, validator: { input: signupName } },
      birthDate: { type: "string", required: true, validator: { input: birthDateSchema }, returned: false },
      learningTime: { type: "string", required: true, validator: { input: learningTimeSchema }, returned: false },
    } },
    plugins: [expo()],
  });
}
