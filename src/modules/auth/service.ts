import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import type { Config } from "../../config";
import type { PrismaClient } from "../../generated/prisma/client";
import { HttpError, type Actor } from "../../shared/authorization";
import { birthDateSchema, learningTimeSchema, signupName } from "./schemas";
import type { ActorFor, GetSession } from "./types";

export function createAuth(db: PrismaClient, config: Config) {
  // A nested write makes the school profile part of the auth user's creation.
  // This client is used only by Better Auth; operator provisioning has its own roles.
  const signupDb = db.$extends({
    query: {
      user: {
        async create({ args, query }) {
          args.data.profile = {
            create: {
              firstName: args.data.firstName || args.data.name,
              lastName: args.data.lastName,
              role: "student",
              student: { create: {} },
            },
          };
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
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    advanced: { database: { generateId: "uuid" } },
    rateLimit: { enabled: true },
    user: {
      additionalFields: {
        firstName: {
          type: "string",
          required: true,
          validator: { input: signupName },
        },
        lastName: {
          type: "string",
          required: true,
          validator: { input: signupName },
        },
        birthDate: {
          type: "string",
          required: true,
          validator: { input: birthDateSchema },
          returned: false,
        },
        learningTime: {
          type: "string",
          required: true,
          validator: { input: learningTimeSchema },
          returned: false,
        },
      },
    },
    plugins: [expo()],
  });
}

export function createActorResolver(db: PrismaClient, getSession: GetSession): ActorFor {
  return async function actorFor(request: Request): Promise<Actor> {
    const session = await getSession(request.headers);
    if (!session) throw new HttpError(401, "Authentication required");
    const profile = await db.profile.findUnique({
      where: { id: session.user.id },
      include: { student: true, teacher: true },
    });
    if (!profile) throw new HttpError(403, "Account has not been provisioned");
    return {
      id: profile.id,
      role: profile.role,
      studentId: profile.student?.id ?? null,
      teacherId: profile.teacher?.id ?? null,
    };
  };
}
