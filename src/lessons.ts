import { Elysia } from "elysia";
import { z } from "zod";
import type { PrismaClient, Prisma } from "./generated/prisma/client";
import { HttpError, enrollmentScope, requireStaff, type Actor } from "./authorization";
import { checkTrialConflict } from "./trial-conflicts";
import { pagination } from "./contracts";
import { addDays, bounds, DAY, dayNumber, occurrences, type Schedule } from "./scheduling";
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const slot = z.strictObject({ date: z.iso.date(), endDate: z.iso.date().optional(), startTime: time, endTime: time, allDay: z.boolean().optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(), reminderMinutes: z.number().int().min(0).max(10080).nullable().optional() })
  .refine(v => { const [a, b] = bounds(v); return b > a && b - a <= 31 * DAY; }, "Choose a positive duration of at most 31 days");
const repeat = z.strictObject({ frequency: z.enum(["daily", "weekly"]), interval: z.number().int().min(1).max(52), weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(), until: z.iso.date() });
const createBody = slot.safeExtend({ enrollmentId: z.uuid(), teacherId: z.uuid().optional(), repeat: repeat.optional() }).refine(v => !v.repeat || (v.repeat.until >= v.date && dayNumber(v.repeat.until) - dayNumber(v.date) <= 366 * DAY), "Repeat must end within one year");
const editBody = slot.safeExtend({ teacherId: z.uuid().optional(), scope: z.enum(["one", "future"]).optional() });
const scope = (actor: Actor) => {
  if (actor.role === "teacher") {
    if (!actor.teacherId) throw new HttpError(403, "Teacher account is incomplete");
    return { teacherId: actor.teacherId };
  }
  const enrollment = enrollmentScope(actor);
  // Payment approval unlocks cards only for the paying student's course.
  // Teacher visibility and scheduling do not depend on payment.
  return { enrollment: { ...enrollment, ...(actor.role === "student" ? {
    course: { payments: { some: { studentId: actor.studentId!, status: "approved" as const } } },
  } : {}) } };
};
async function selectedTeacher(tx: Prisma.TransactionClient, teacherId: string) {
  if (!await tx.teacher.findUnique({ where: { id: teacherId }, select: { id: true } })) throw new HttpError(422, "Select an existing teacher");
  return teacherId;
}
const include = { enrollment: { include: { course: { select: { name: true } }, student: { select: { profile: { select: { firstName: true, lastName: true } } } } } }, teacher: { select: { profile: { select: { firstName: true, lastName: true } } } } } as const;
type StoredSlot = { date: Date; endDate?: Date | null; startTime: Date; endTime: Date | null; allDay?: boolean };
export function serialize<T extends StoredSlot>(lesson: T) {
  // All-day end dates are inclusive in the API, exclusive in storage.
  const date = lesson.date.toISOString().slice(0, 10);
  const end = lesson.endDate?.toISOString().slice(0, 10) || date;
  return { ...lesson, date, endDate: lesson.allDay ? addDays(end, -1) : end, startTime: lesson.startTime.toISOString().slice(11, 16), endTime: lesson.endTime?.toISOString().slice(11, 16) ?? null };
}
export function dates(body: Schedule) {
  return { date: new Date(body.date + "T00:00:00Z"), endDate: new Date((body.allDay ? addDays(body.endDate || body.date, 1) : body.endDate || body.date) + "T00:00:00Z"), startTime: new Date("1970-01-01T" + (body.allDay ? "00:00" : body.startTime) + ":00Z"), endTime: new Date("1970-01-01T" + (body.allDay ? "00:00" : body.endTime) + ":00Z"), allDay: body.allDay || false };
}
export function storedBounds(row: StoredSlot): [number, number] {
  return [row.date.getTime() + row.startTime.getTime(), (row.endDate || row.date).getTime() + (row.endTime?.getTime() ?? DAY)];
}
async function checkConflict(tx: Prisma.TransactionClient, enrollment: { studentId: string; teacherId: string }, times: ReturnType<typeof dates>, excluded: string[] = []) {
  const [start, end] = storedBounds(times);
  await checkTrialConflict(tx, enrollment.teacherId, enrollment.studentId, new Date(start - 4 * 3600000), new Date(end - 4 * 3600000));
  const candidates = await tx.lesson.findMany({ where: {
    ...(excluded.length ? { id: { notIn: excluded } } : {}), status: { notIn: ["cancelled", "rescheduled"] },
    OR: [{ teacherId: enrollment.teacherId }, { enrollment: { studentId: enrollment.studentId } }],
    date: { lte: times.endDate }, AND: [{ OR: [{ endDate: { gte: times.date } }, { endDate: null, date: { gte: times.date } }] }],
  } });
  const [a, b] = storedBounds(times);
  if (candidates.some(row => { const [c, d] = storedBounds(row); return c < b && d > a; })) throw new HttpError(409, "Teacher or student already has a lesson at this time");
}
// Shared by every schedule write and reminder worker, across API instances.
export const scheduleLock = (tx: Prisma.TransactionClient) => tx.$executeRaw`LOCK TABLE lessons IN SHARE ROW EXCLUSIVE MODE`;
function reminder(slot: Schedule, reminderMinutes: number | null) {
  return { reminderMinutes, reminderAt: reminderMinutes === null ? null : new Date(new Date(slot.date + "T" + (slot.allDay ? "00:00" : slot.startTime) + ":00+04:00").getTime() - reminderMinutes * 60000), reminderSentAt: null };
}
async function earlierUnfinished(db: Pick<Prisma.TransactionClient, "lesson">, actor: Actor, lesson: StoredSlot & { id: string; enrollmentId: string }, now = new Date()) {
  const cutoff = Math.min(storedBounds(lesson)[0], now.getTime() + 4 * 3600000);
  const rows = await db.lesson.findMany({ where: { ...scope(actor), enrollmentId: lesson.enrollmentId, status: "scheduled", id: { notIn: [lesson.id] }, date: { lte: lesson.date } }, include, orderBy: [{ date: "asc" }, { startTime: "asc" }, { id: "asc" }] });
  return rows.filter(row => storedBounds(row)[0] < storedBounds(lesson)[0] && storedBounds(row)[1] <= cutoff);
}
export function lessonRoutes(db: PrismaClient, actorFor: (request: Request) => Promise<Actor>) {
  return new Elysia()
    .get("/api/lessons/:id/status-options", async ({ request, params }) => {
      const actor = await actorFor(request);
      if (actor.role === "student") throw new HttpError(403, "Staff or assigned teacher access required");
      const lesson = await db.lesson.findFirst({ where: { id: params.id, ...scope(actor) }, include });
      if (!lesson) throw new HttpError(404, "Lesson not found");
      const [earlier, series] = await Promise.all([
        earlierUnfinished(db, actor, lesson),
        lesson.seriesId ? db.lesson.findMany({ where: { ...scope(actor), seriesId: lesson.seriesId }, select: { id: true, status: true } }) : Promise.resolve([]),
      ]);
      return { earlier: earlier.map(serialize), seriesCount: series.filter(row => row.status === "scheduled").length, deleteCount: series.length };
    }, { params: z.object({ id: z.uuid() }) })
    .get("/api/lessons", async ({ request, query }) => {
      const actor = await actorFor(request);
      const from = query.from ? new Date(query.from) : undefined;
      return (await db.lesson.findMany({ where: { ...scope(actor), ...(query.status ? { status: query.status } : {}), ...(query.to ? { date: { lte: new Date(query.to) } } : {}), ...(from ? { AND: [{ OR: [{ endDate: { gt: from } }, { endDate: from, OR: [{ endTime: { gt: new Date(0) } }, { endTime: null }] }, { endDate: null, date: { gte: from } }] }] } : {}) }, include, take: query.limit, skip: query.offset, orderBy: [{ date: "asc" }, { startTime: "asc" }, { id: "asc" }] })).map(serialize);
    }, { query: pagination.extend({ from: z.iso.date().optional(), to: z.iso.date().optional(), status: z.enum(["scheduled", "completed", "cancelled"]).optional() }).refine(v => !v.from || !v.to || v.from <= v.to) })
    .post("/api/lessons", async ({ request, body, set }) => {
      const actor = await actorFor(request);
      if (actor.role === "teacher") {
        scope(actor);
        if (body.teacherId && body.teacherId !== actor.teacherId) throw new HttpError(403, "Teachers can schedule only their own lessons");
      } else requireStaff(actor);
      const lesson = await db.$transaction(async tx => {
        await scheduleLock(tx);
        const enrollment = await tx.enrollment.findUnique({ where: { id: body.enrollmentId }, include: { student: true, course: true } });
        if (actor.role === "teacher" && enrollment?.teacherId !== actor.teacherId) throw new HttpError(404, "Enrollment not found");
        if (!enrollment || enrollment.student.status !== "active" || !enrollment.course.active) throw new HttpError(422, "Select an active enrollment");
        const teacherId = body.teacherId ? await selectedTeacher(tx, body.teacherId) : enrollment.teacherId;
        let slots: Schedule[];
        try { slots = occurrences(body, body.repeat); } catch (e) { throw new HttpError(422, (e as Error).message); }
        if (!slots.length) throw new HttpError(422, "Repeat rule does not produce any lessons");
        const seriesId = body.repeat ? crypto.randomUUID() : null;
        let first;
        for (const slot of slots) {
          const times = dates(slot);
          await checkConflict(tx, { studentId: enrollment.studentId, teacherId }, times);
          const created = await tx.lesson.create({ data: { ...times, color: body.color ?? null, ...reminder(slot, body.reminderMinutes ?? null), seriesId, ...(body.repeat ? { repeatRule: body.repeat } : {}), enrollmentId: enrollment.id, teacherId }, include });
          first ??= created;
        }
        return first!;
      }, { isolationLevel: "ReadCommitted", timeout: 30000 });
      set.status = 201;
      return serialize(lesson);
    }, { body: createBody })
    .delete("/api/lessons/:id", async ({ request, params, query }) => {
      const actor = await actorFor(request);
      if (actor.role === "student") throw new HttpError(403, "Staff or assigned teacher access required");
      return db.$transaction(async tx => {
        await scheduleLock(tx);
        const lesson = await tx.lesson.findFirst({ where: { id: params.id, ...scope(actor) }, include: { _count: { select: { progress: true } } } });
        if (!lesson) throw new HttpError(404, "Lesson not found");
        const targets = query.scope === "all" && lesson.seriesId
          ? await tx.lesson.findMany({ where: { seriesId: lesson.seriesId, ...scope(actor) }, include: { _count: { select: { progress: true } } } }) : [lesson];
        if (targets.some(row => row._count.progress)) throw new HttpError(409, "A selected lesson has progress records. Nothing was deleted.");
        await tx.lesson.deleteMany({ where: { id: { in: targets.map(row => row.id) } } });
        return { deleted: true };
      });
    }, { params: z.object({ id: z.uuid() }), query: z.object({ scope: z.enum(["one", "all"]).default("one") }) })
    .patch("/api/lessons/:id", async ({ request, params, body }) => {
      const actor = await actorFor(request);
      if (actor.role === "student") throw new HttpError(403, "Staff or assigned teacher access required");
      return serialize(await db.$transaction(async tx => {
        await scheduleLock(tx);
        const lesson = await tx.lesson.findFirst({ where: { id: params.id, ...scope(actor) }, include: { enrollment: true } });
        if (!lesson) throw new HttpError(404, "Lesson not found");
        if (lesson.status !== "scheduled") throw new HttpError(409, "Only scheduled lessons can be changed");
        let targets = (body.scope === "future" || body.scope === "all") && lesson.seriesId ? await tx.lesson.findMany({ where: { ...scope(actor), seriesId: lesson.seriesId, status: "scheduled", ...(body.scope === "future" ? { date: { gte: lesson.date } } : {}) }, orderBy: [{ date: "asc" }, { id: "asc" }] }) : [lesson];
        if ("status" in body) {
          if (body.status === "completed" && body.includeEarlier) {
            const earlier = await earlierUnfinished(tx, actor, lesson);
            targets = [...new Map([...targets, ...earlier].map(row => [row.id, row])).values()];
          }
          if (targets.length === 1) return tx.lesson.update({ where: { id: lesson.id }, data: { status: body.status, reminderAt: null }, include });
          await tx.lesson.updateMany({ where: { id: { in: targets.map(row => row.id) } }, data: { status: body.status, reminderAt: null } });
          return tx.lesson.findUniqueOrThrow({ where: { id: lesson.id }, include });
        }
        if (body.teacherId !== undefined) requireStaff(actor);
        const teacherId = body.teacherId ? await selectedTeacher(tx, body.teacherId) : undefined;
        const shift = (dayNumber(body.date) - lesson.date.getTime()) / DAY;
        const endOffset = (dayNumber(body.endDate || body.date) - dayNumber(body.date)) / DAY;
        const excluded = targets.map(row => row.id);
        const proposed = targets.map(row => { const date = addDays(row.date.toISOString().slice(0, 10), shift); const slot = { ...body, date, endDate: addDays(date, endOffset) }; return { row, slot, times: dates(slot) }; });
        for (let i = 0; i < proposed.length; i++) {
          const current = proposed[i];
          await checkConflict(tx, { studentId: lesson.enrollment.studentId, teacherId: teacherId ?? current.row.teacherId }, current.times, excluded);
          const [a, b] = storedBounds(current.times);
          if (proposed.slice(0, i).some(other => { const [c, d] = storedBounds(other.times); return a < d && b > c; })) throw new HttpError(409, "Repeating lessons overlap each other");
        }
        // Color is shared by the series, independently of the schedule-edit scope.
        if (lesson.seriesId && body.color !== undefined && body.color !== lesson.color) {
          await tx.lesson.updateMany({ where: { ...scope(actor), seriesId: lesson.seriesId }, data: { color: body.color } });
        }
        const seriesId = targets.length > 1 ? crypto.randomUUID() : lesson.seriesId;
        let result;
        for (const { row, slot, times } of proposed) {
          const updated = await tx.lesson.update({ where: { id: row.id }, data: { ...times, ...(body.color !== undefined ? { color: body.color } : {}), ...(teacherId ? { teacherId } : {}), seriesId, ...reminder(slot, body.reminderMinutes === undefined ? row.reminderMinutes ?? null : body.reminderMinutes) }, include });
          if (row.id === lesson.id) result = updated;
        }
        return result!;
      }, { isolationLevel: "ReadCommitted", timeout: 30000 }));
    }, { params: z.object({ id: z.uuid() }), body: z.union([editBody,
      z.strictObject({ status: z.literal("cancelled"), scope: z.enum(["one", "future", "all"]).optional() }),
      z.strictObject({ status: z.literal("completed"), scope: z.enum(["one", "future", "all"]).optional(), includeEarlier: z.boolean().optional() }),
    ]) });
}
