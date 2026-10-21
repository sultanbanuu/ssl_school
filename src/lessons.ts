import { Elysia } from "elysia";
import { z } from "zod";
import type { PrismaClient, Prisma } from "./generated/prisma/client";
import { HttpError, enrollmentScope, requireStaff, type Actor } from "./authorization";
import { pagination } from "./contracts";

const slot = z.strictObject({ date: z.iso.date(), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) })
  .refine(v => v.endTime > v.startTime, "End time must follow start time");
const createBody = slot.safeExtend({ enrollmentId: z.uuid() });
const params = z.object({ id: z.uuid() });
const scope = (actor: Actor) => ({ enrollment: enrollmentScope(actor) });
const include = { enrollment: { include: { course: { select: { name: true } }, student: { select: { profile: { select: { firstName: true, lastName: true } } } } } }, teacher: { select: { profile: { select: { firstName: true, lastName: true } } } } } as const;
function serialize<T extends { date: Date; startTime: Date; endTime: Date | null }>(lesson: T) {
  return { ...lesson, date: lesson.date.toISOString().slice(0, 10), startTime: lesson.startTime.toISOString().slice(11, 16), endTime: lesson.endTime?.toISOString().slice(11, 16) ?? null };
}
function dates(body: z.infer<typeof slot>) {
  return { date: new Date(`${body.date}T00:00:00Z`), startTime: new Date(`1970-01-01T${body.startTime}:00Z`), endTime: new Date(`1970-01-01T${body.endTime}:00Z`) };
}
async function checkConflict(tx: Prisma.TransactionClient, enrollment: { studentId: string; teacherId: string }, times: ReturnType<typeof dates>, id?: string) {
  const conflict = await tx.lesson.findFirst({ where: {
    ...(id ? { id: { not: id } } : {}), date: times.date, status: { not: "cancelled" },
    OR: [{ teacherId: enrollment.teacherId }, { enrollment: { studentId: enrollment.studentId } }],
    startTime: { lt: times.endTime }, AND: [{ OR: [{ endTime: { gt: times.startTime } }, { endTime: null }] }],
  } });
  if (conflict) throw new HttpError(409, "Teacher or student already has a lesson at this time");
}
// Serialize schedule mutations before reading conflicts. READ COMMITTED gives the
// waiter a fresh snapshot after the previous booking commits.
const lock = (tx: Prisma.TransactionClient) => tx.$executeRaw`LOCK TABLE lessons IN SHARE ROW EXCLUSIVE MODE`;
export function lessonRoutes(db: PrismaClient, actorFor: (request: Request) => Promise<Actor>) {
  return new Elysia()
    .get("/api/lessons", async ({ request, query }) => {
      const actor = await actorFor(request);
      return (await db.lesson.findMany({ where: { ...scope(actor), ...(query.status ? { status: query.status } : {}), ...(query.from || query.to ? { date: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}) }, include, take: query.limit, skip: query.offset, orderBy: [{ date: "asc" }, { startTime: "asc" }, { id: "asc" }] })).map(serialize);
    }, { query: pagination.extend({ from: z.iso.date().optional(), to: z.iso.date().optional(), status: z.enum(["scheduled", "completed", "cancelled"]).optional() }).refine(v => !v.from || !v.to || v.from <= v.to) })
    .post("/api/lessons", async ({ request, body, set }) => {
      requireStaff(await actorFor(request));
      const lesson = await db.$transaction(async tx => {
        await lock(tx);
        const enrollment = await tx.enrollment.findUnique({ where: { id: body.enrollmentId }, include: { student: true, course: true } });
        if (!enrollment || enrollment.student.status !== "active" || !enrollment.course.active) throw new HttpError(422, "Select an active enrollment");
        const times = dates(body);
        await checkConflict(tx, enrollment, times);
        return tx.lesson.create({ data: { ...times, enrollmentId: enrollment.id, teacherId: enrollment.teacherId }, include });
      }, { isolationLevel: "ReadCommitted" });
      set.status = 201;
      return serialize(lesson);
    }, { body: createBody })
    .patch("/api/lessons/:id", async ({ request, params, body }) => {
      const actor = await actorFor(request);
      if (actor.role === "student") throw new HttpError(403, "Staff or assigned teacher access required");
      return serialize(await db.$transaction(async tx => {
        await lock(tx);
        const lesson = await tx.lesson.findFirst({ where: { id: params.id, ...scope(actor) }, include: { enrollment: true } });
        if (!lesson) throw new HttpError(404, "Lesson not found");
        if (lesson.status !== "scheduled") throw new HttpError(409, "Only scheduled lessons can be changed");
        if ("status" in body) return tx.lesson.update({ where: { id: lesson.id }, data: { status: body.status }, include });
        const times = dates(body);
        await checkConflict(tx, lesson.enrollment, times, lesson.id);
        return tx.lesson.update({ where: { id: lesson.id }, data: times, include });
      }, { isolationLevel: "ReadCommitted" }));
    }, { params, body: z.union([slot, z.strictObject({ status: z.enum(["cancelled", "completed"]) })]) });
}
