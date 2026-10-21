import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { Prisma, type PrismaClient } from "./generated/prisma/client";
import { HttpError, courseScope, enrollmentScope, requireStaff, type Actor } from "./authorization";
import { createCourseBody, createEnrollmentBody, pagination } from "./contracts";
import { peopleRoutes } from "./people";
import { paymentRoutes } from "./payments";
import type { ReceiptStorage } from "./receipt-storage";

type Dependencies = {
  db: PrismaClient;
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>;
  authHandler: (request: Request) => Promise<Response>;
  origins: string[];
  receipts?: ReceiptStorage;
};

export function createApp({ db, getSession, authHandler, origins, receipts }: Dependencies) {
  async function actorFor(request: Request): Promise<Actor> {
    const session = await getSession(request.headers);
    if (!session) throw new HttpError(401, "Authentication required");
    const profile = await db.profile.findUnique({ where: { id: session.user.id }, include: { student: true, teacher: true } });
    if (!profile) throw new HttpError(403, "Account has not been provisioned");
    return { id: profile.id, role: profile.role, studentId: profile.student?.id ?? null, teacherId: profile.teacher?.id ?? null };
  }

  return new Elysia()
    .use(cors({ origin: origins.filter((o) => /^https?:/.test(o)), credentials: true }))
    .onError(({ code, error, set }) => {
      if (error instanceof HttpError) { set.status = error.status; return { error: error.message }; }
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") { set.status = 409; return { error: "Record already exists" }; }
        if (error.code === "P2003") { set.status = 422; return { error: "Related record does not exist" }; }
        if (error.code === "P2025") { set.status = 404; return { error: "Record not found" }; }
      }
      if (code === "VALIDATION" || code === "PARSE") { set.status = 422; return { error: "Invalid request" }; }
      if (code === "NOT_FOUND") { set.status = 404; return { error: "Not found" }; }
      set.status = 500;
      console.error("API request failed", { code, type: error.constructor.name });
      return { error: "Internal server error" };
    })
    .get("/health", () => ({ status: "ok", service: "ssl-school-api" }))
    .get("/ready", async ({ set }) => {
      try { await db.$queryRaw`SELECT 1`; return { status: "ready" }; }
      catch { set.status = 503; return { status: "unavailable" }; }
    })
    .all("/api/auth/*", ({ request }) => authHandler(request))
    .use(peopleRoutes(db, actorFor))
    .use(paymentRoutes(db, actorFor, receipts))
    .get("/api/me", async ({ request }) => {
      const actor = await actorFor(request);
      return db.profile.findUnique({ where: { id: actor.id }, include: { student: true, teacher: true } });
    })
    .get("/api/courses", async ({ request, query }) => {
      const actor = await actorFor(request);
      const records = await db.course.findMany({ where: courseScope(actor), take: query.limit, skip: query.offset, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
      return records.map((course) => ({ ...course, duration: course.duration?.toString() ?? null, price: course.price.toFixed(2) }));
    }, { query: pagination })
    .post("/api/courses", async ({ request, body, set }) => {
      requireStaff(await actorFor(request));
      const course = await db.course.create({ data: { ...body, duration: body.duration === undefined ? undefined : BigInt(body.duration) } });
      set.status = 201;
      return { ...course, duration: course.duration?.toString() ?? null, price: course.price.toFixed(2) };
    }, { body: createCourseBody })
    .get("/api/enrollments", async ({ request, query }) => {
      const actor = await actorFor(request);
      return db.enrollment.findMany({ where: enrollmentScope(actor), take: query.limit, skip: query.offset, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
    }, { query: pagination })
    .post("/api/enrollments", async ({ request, body, set }) => {
      requireStaff(await actorFor(request));
      const result = await db.$transaction(async (tx) => {
        const course = await tx.course.findUnique({ where: { id: body.courseId } });
        if (!course?.active) throw new HttpError(422, "Select an active course");
        const student = await tx.student.findUnique({ where: { id: body.studentId } });
        if (!student || student.status !== "active") throw new HttpError(422, "Select an active student");
        return tx.enrollment.create({ data: { ...body, teacherId: course.teacherId } });
      });
      set.status = 201;
      return result;
    }, { body: createEnrollmentBody });
}
