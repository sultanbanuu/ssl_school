import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { Prisma, type PrismaClient } from "./generated/prisma/client";
import { HttpError } from "./shared/authorization";
import { authRoutes } from "./modules/auth/routes";
import { createActorResolver } from "./modules/auth/service";
import type { AuthHandler, GetSession } from "./modules/auth/types";
import { healthRoutes } from "./modules/health/routes";
import { profileRoutes } from "./modules/profile/routes";
import { courseRoutes } from "./modules/courses/routes";
import { enrollmentRoutes } from "./modules/enrollments/routes";
import { peopleRoutes } from "./modules/people/routes";
import { roleRoutes } from "./modules/roles/routes";
import { availabilityRoutes } from "./modules/availability/routes";
import { lessonRoutes } from "./modules/lessons/routes";
import { reschedulingRoutes } from "./modules/rescheduling/routes";
import { paymentRoutes } from "./modules/payments/routes";
import { notificationRoutes } from "./modules/notifications/routes";
import { auditRoutes } from "./modules/audit/routes";
import { performanceRoutes } from "./modules/performance/routes";
import type { ReceiptStorage } from "./receipt-storage";
import { webSubscription } from "./web-push";

type Dependencies = {
  db: PrismaClient;
  getSession: GetSession;
  authHandler: AuthHandler;
  origins: string[];
  receipts?: ReceiptStorage;
};

export function createApp({
  db,
  getSession,
  authHandler,
  origins,
  receipts,
}: Dependencies) {
  const actorFor = createActorResolver(db, getSession);

  return new Elysia()
    .use(
      cors({
        origin: origins.filter((o) => /^https?:/.test(o)),
        credentials: true,
      }),
    )
    .onError(({ code, error, set, body, request }) => {
      if (error instanceof HttpError) {
        set.status = error.status;
        return { error: error.message };
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          set.status = 409;
          return { error: "Record already exists" };
        }
        if (error.code === "P2003") {
          set.status = 422;
          return { error: "Related record does not exist" };
        }
        if (error.code === "P2025") {
          set.status = 404;
          return { error: "Record not found" };
        }
      }
      if (code === "VALIDATION" || code === "PARSE") {
        set.status = 422;
        if (new URL(request.url).pathname === "/api/notifications/devices") {
          const token = (body as { token?: unknown } | undefined)?.token;
          if (typeof token === "string" && token.startsWith("web:")) {
            try {
              const subscription = JSON.parse(token.slice(4));
              const parsed = webSubscription.safeParse(subscription);
              const host = typeof subscription.endpoint === "string" ? new URL(subscription.endpoint).hostname : "missing";
              console.warn("Browser push validation rejected", {
                method: request.method, host, tokenLength: token.length,
                endpointLength: subscription.endpoint?.length,
                keyLengths: { p256dh: subscription.keys?.p256dh?.length, auth: subscription.keys?.auth?.length },
                fields: parsed.success ? [] : parsed.error.issues.map(issue => issue.path.join(".")),
              });
              return { error: `Browser notification registration was rejected (${host}; ${parsed.success ? "request format" : parsed.error.issues.map(issue => issue.path.join(".")).join(", ")}).` };
            } catch { return { error: "The saved browser notification subscription is invalid. Please reset notifications in your browser’s site settings." }; }
          }
        }
        return { error: "Invalid request" };
      }
      if (code === "NOT_FOUND") {
        set.status = 404;
        return { error: "Not found" };
      }
      set.status = 500;
      console.error("API request failed", {
        code,
        type: error.constructor.name,
      });
      return { error: "Internal server error" };
    })
    .use(healthRoutes(db))
    .use(authRoutes(authHandler))
    .use(peopleRoutes(db, actorFor))
    .use(roleRoutes(db, actorFor))
    .use(lessonRoutes(db, actorFor))
    .use(reschedulingRoutes(db, actorFor))
    .use(availabilityRoutes(db, actorFor))
    .use(paymentRoutes(db, actorFor, receipts))
    .use(notificationRoutes(db, actorFor))
    .use(auditRoutes(db, actorFor))
    .use(performanceRoutes(db, actorFor))
    .use(profileRoutes(db, actorFor))
    .use(courseRoutes(db, actorFor))
    .use(enrollmentRoutes(db, actorFor));
}
