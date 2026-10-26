import { Elysia } from "elysia";
import { z } from "zod";
import type { PrismaClient, Prisma } from "./generated/prisma/client";
import { HttpError, requireStaff, type Actor } from "./authorization";
import { pagination } from "./contracts";
import { scheduleLock, storedBounds } from "./lessons";
import { checkTrialConflict } from "./trial-conflicts";
import { minutes, dayNumber, DAY, addDays, timeString } from "./scheduling";

const names = { select: { firstName: true, lastName: true } } as const;
const slotInclude = { teacher: { select: { id: true, profile: names } }, course: { select: { id: true, name: true } } } as const;
const requestInclude = { slot: { include: slotInclude }, student: { select: { profile: names } } } as const;
const held = ["pending", "approved"];
const slotBody = z.strictObject({ teacherId: z.uuid(), courseId: z.uuid(), date: z.iso.date(), startTime: z.string().regex(/^\d{2}:\d{2}$/), endTime: z.string().regex(/^\d{2}:\d{2}$/) }).refine(v => new Date(v.date + "T12:00:00Z").getUTCDay() !== 0 && (minutes(v.startTime) >= 600 && minutes(v.endTime) <= 660 || minutes(v.startTime) >= 960 && minutes(v.endTime) <= 1410) && minutes(v.endTime) - minutes(v.startTime) === 15 && [v.startTime, v.endTime].every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t) && minutes(t) % 15 === 0), "Choose a 15-minute trial Monday–Saturday at 10am or after 4pm");
function management(actor: Actor) {
  if (actor.role === "teacher") {
    if (!actor.teacherId) throw new HttpError(403, "Teacher account is incomplete");
    return { teacherId: actor.teacherId };
  }
  requireStaff(actor); return {};
}
function student(actor: Actor) {
  if (actor.role !== "student" || !actor.studentId) throw new HttpError(403, "Student access required");
  return actor.studentId;
}
const times = (body: z.infer<typeof slotBody>) => ({ startsAt: new Date(`${body.date}T${body.startTime}:00+04:00`), endsAt: new Date(`${body.date}T${body.endTime}:00+04:00`) });
async function regularCandidates(tx: Pick<Prisma.TransactionClient, "lesson">, teacherIds: string[], studentId: string | undefined, startsAt: Date, endsAt: Date) {
  const date = new Date(Math.floor((endsAt.getTime() + 4 * 3600000) / DAY) * DAY);
  const from = new Date(Math.floor((startsAt.getTime() + 4 * 3600000) / DAY) * DAY);
  return tx.lesson.findMany({ where: { status: { notIn: ["cancelled", "rescheduled"] }, date: { lte: date }, AND: [{ OR: [{ endDate: { gte: from } }, { endDate: null, date: { gte: from } }] }], OR: [{ teacherId: { in: teacherIds } }, ...(studentId ? [{ enrollment: { studentId } }] : [])] }, include: { enrollment: { select: { studentId: true } } } });
}
export async function regularConflict(tx: Pick<Prisma.TransactionClient, "lesson">, teacherId: string, studentId: string | undefined, startsAt: Date, endsAt: Date) {
  const rows = await regularCandidates(tx, [teacherId], studentId, startsAt, endsAt);
  return rows.some(row => overlapsLesson(row, startsAt, endsAt));
}
function overlapsLesson(row: Parameters<typeof storedBounds>[0], startsAt: Date, endsAt: Date) { const [a, b] = storedBounds(row); return a - 4 * 3600000 < endsAt.getTime() && b - 4 * 3600000 > startsAt.getTime(); }
async function validateSlot(tx: Prisma.TransactionClient, actor: Actor, body: z.infer<typeof slotBody>, id?: string) {
  const owned = management(actor);
  if ("teacherId" in owned && body.teacherId !== owned.teacherId) throw new HttpError(403, "Publish availability only for yourself");
  const course = await tx.course.findUnique({ where: { id: body.courseId } });
  if (!course?.active || course.teacherId !== body.teacherId) throw new HttpError(422, "Choose an active course belonging to this teacher");
  const range = times(body);
  if (range.startsAt <= new Date()) throw new HttpError(422, "Choose a future time");
  if (await regularConflict(tx, body.teacherId, undefined, range.startsAt, range.endsAt)) throw new HttpError(409, "Teacher already has a lesson at this time");
  const overlap = await tx.availabilitySlot.findFirst({ where: { teacherId: body.teacherId, active: true, startsAt: { lt: range.endsAt }, endsAt: { gt: range.startsAt }, ...(id ? { id: { not: id } } : {}) } });
  if (overlap) throw new HttpError(409, "This time overlaps another availability slot");
  return range;
}
// Stable variation avoids moving appointment times on every refresh.
export function trialMinute(date: string, hour: number) {
  let hash = hour;
  for (const c of date) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return hour * 60 + hash % (hour === 23 ? 2 : 4) * 15;
}
async function openings(db: Pick<Prisma.TransactionClient, "teacher" | "lesson" | "availabilitySlot">, actor: Actor, from: string, to: string) {
 const teachers = await db.teacher.findMany({ where: { ...(actor.role === "teacher" ? { id: actor.teacherId! } : {}), profile: { firstName: { equals: "Sayad", mode: "insensitive" } } }, include: { profile: names, courses: { where: { active: true }, orderBy: { id: "asc" }, take: 1 } } });
 const result = [];
 for (const teacher of teachers) {
  const course = teacher.courses[0]; if (!course) continue;
  const begin = new Date(from + "T00:00:00+04:00"), end = new Date(new Date(to + "T00:00:00+04:00").getTime() + DAY);
  const lessons = await regularCandidates(db, [teacher.id], actor.role === "student" ? actor.studentId! : undefined, begin, end);
  const existing = await db.availabilitySlot.findMany({ where: { teacherId: teacher.id, startsAt: { lt: end }, endsAt: { gt: begin } } });
  for (let date = from; date <= to; date = addDays(date, 1)) {
   if (new Date(date + "T12:00:00Z").getUTCDay() === 0) continue;
   for (const hour of [10,16,17,18,19,20,21,22,23]) {
    const minute = trialMinute(date, hour), startsAt = new Date(`${date}T${timeString(minute)}:00+04:00`), endsAt = new Date(startsAt.getTime() + 15 * 60000);
    if (startsAt <= new Date() || lessons.some(l => overlapsLesson(l, startsAt, endsAt)) || existing.some(s => s.startsAt < endsAt && s.endsAt > startsAt)) continue;
    result.push({ id: `auto:${teacher.id}:${date}:${hour}`, teacherId: teacher.id, courseId: course.id, startsAt, endsAt, active: true, teacher: { id: teacher.id, profile: teacher.profile }, course: { id: course.id, name: course.name } });
   }
  }
 }
 return result;
}
export function availabilityRoutes(db: PrismaClient, actorFor: (request: Request) => Promise<Actor>) {
  return new Elysia()
    .get("/api/availability", async ({ request, query }) => {
      const actor = await actorFor(request);
      const isStudent = actor.role === "student";
      if (isStudent) student(actor);
      const rows = await db.availabilitySlot.findMany({ where: {
        ...(isStudent ? { active: true, course: { active: true }, requests: { none: { status: { in: held } } } } : management(actor)),
        startsAt: { gte: new Date(Math.max(isStudent ? Date.now() : 0, new Date(query.from + "T00:00:00+04:00").getTime())), lt: new Date(new Date(query.to + "T00:00:00+04:00").getTime() + DAY) },
      }, include: { ...slotInclude, requests: { where: { status: { in: held } }, select: { id: true, status: true, student: { select: { profile: names } } } } }, orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: query.limit, skip: query.offset });
      const lessons = rows.length ? await regularCandidates(db, [...new Set(rows.map(row => row.teacherId))], isStudent ? actor.studentId! : undefined, new Date(query.from + "T00:00:00+04:00"), new Date(new Date(query.to + "T00:00:00+04:00").getTime() + DAY)) : [];
      const items = [];
      for (const { requests, ...row } of rows) {
        const conflict = lessons.some(lesson => (lesson.teacherId === row.teacherId || (isStudent && lesson.enrollment.studentId === actor.studentId)) && overlapsLesson(lesson, row.startsAt, row.endsAt));
        if (isStudent && conflict) continue;
        items.push({ ...row, ...(isStudent ? {} : { reservation: requests[0] || null, conflict }) });
      }
      const generated = query.offset === 0 ? await openings(db, actor, query.from, query.to) : [];
      return { items: [...items.filter(row => !isStudent || row.teacher.profile.firstName?.toLowerCase() === "sayad"), ...generated], hasMore: rows.length === query.limit };
    }, { query: pagination.extend({ from: z.iso.date(), to: z.iso.date() }).refine(v => v.to >= v.from && dayNumber(v.to) - dayNumber(v.from) <= 62 * DAY) })
    .post("/api/availability", async ({ request, body, set }) => {
      const actor = await actorFor(request); management(actor);
      const result = await db.$transaction(async tx => { await scheduleLock(tx); const range = await validateSlot(tx, actor, body); return tx.availabilitySlot.create({ data: { teacherId: body.teacherId, courseId: body.courseId, ...range }, include: slotInclude }); });
      set.status = 201; return result;
    }, { body: slotBody })
    .patch("/api/availability/:id", async ({ request, body, params }) => {
      const actor = await actorFor(request); const owned = management(actor);
      return db.$transaction(async tx => {
        await scheduleLock(tx);
        const slot = await tx.availabilitySlot.findFirst({ where: { id: params.id, ...owned } });
        if (!slot) throw new HttpError(404, "Availability not found");
        const reservations = await tx.trialRequest.findMany({ where: { slotId: slot.id, status: { in: held } } });
        if ("active" in body) await tx.trialRequest.updateMany({ where: { slotId: slot.id, status: { in: held } }, data: { status: "cancelled" } });
        else for (const reservation of reservations) {
          const range = times(body);
          if (await regularConflict(tx, body.teacherId, reservation.studentId, range.startsAt, range.endsAt)) throw new HttpError(409, "Student or teacher already has a lesson at this time");
          await checkTrialConflict(tx, body.teacherId, reservation.studentId, range.startsAt, range.endsAt, reservation.id);
        }

        const data = "active" in body ? { active: false } : { ...await validateSlot(tx, actor, body, slot.id), teacherId: body.teacherId, courseId: body.courseId, active: true };
        return tx.availabilitySlot.update({ where: { id: slot.id }, data, include: slotInclude });
      });
    }, { params: z.object({ id: z.uuid() }), body: z.union([slotBody, z.strictObject({ active: z.literal(false) })]) })
    .delete("/api/availability/:id", async ({ request, params }) => {
      const actor = await actorFor(request);
      if (actor.role !== "teacher" && actor.role !== "admin") throw new HttpError(403, "Teacher or administrator access required");
      const owned = management(actor);
      return db.$transaction(async tx => {
        await scheduleLock(tx);
        if (params.id.startsWith("auto:")) {
          const [, teacherId, date] = params.id.split(":");
          if (actor.role === "teacher" && teacherId !== actor.teacherId) throw new HttpError(404, "Availability not found");
          const slot = (await openings(tx, actor, date!, date!)).find(s => s.id === params.id);
          if (!slot) throw new HttpError(409, "This availability has changed. Refresh and try again.");
          // An inactive record prevents this generated time from reappearing.
          await tx.availabilitySlot.create({ data: { teacherId: slot.teacherId, courseId: slot.courseId, startsAt: slot.startsAt, endsAt: slot.endsAt, active: false } });
        } else {
          const slot = await tx.availabilitySlot.findFirst({ where: { id: params.id, ...owned } });
          if (!slot) throw new HttpError(404, "Availability not found");
          await tx.trialRequest.updateMany({ where: { slotId: slot.id, status: { in: held } }, data: { status: "cancelled" } });
          // Preserve trial history while removing the time from booking.
          await tx.availabilitySlot.update({ where: { id: slot.id }, data: { active: false } });
        }
        return { success: true };
      });
    }, { params: z.object({ id: z.union([z.uuid(), z.string().regex(/^auto:[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}:(10|1[6-9]|2[0-3])$/)]) }) })
    .get("/api/trial-requests", async ({ request, query }) => {
      const actor = await actorFor(request);
      const where = actor.role === "student" ? { studentId: student(actor) } : { slot: management(actor) };
      return db.trialRequest.findMany({ where, include: requestInclude, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: query.limit, skip: query.offset });
    }, { query: pagination })
    .post("/api/trial-requests", async ({ request, body, set }) => {
      const actor = await actorFor(request); const studentId = student(actor);
      const result = await db.$transaction(async tx => {
        await scheduleLock(tx);
        const person = await tx.student.findUnique({ where: { id: studentId } });
        if (person?.status !== "active") throw new HttpError(403, "An active student account is required");
        let slot;
        if (body.slotId.startsWith("auto:")) {
          const [, , date] = body.slotId.split(":");
          const candidate = (await openings(tx, actor, date!, date!)).find(s => s.id === body.slotId);
          if (!candidate) throw new HttpError(409, "This time is no longer available");
          slot = await tx.availabilitySlot.create({ data: { teacherId: candidate.teacherId, courseId: candidate.courseId, startsAt: candidate.startsAt, endsAt: candidate.endsAt } });
        } else slot = await tx.availabilitySlot.findFirst({ where: { id: body.slotId, active: true, course: { active: true } } });
        if (!slot || slot.startsAt <= new Date()) throw new HttpError(409, "This time is no longer available");
        if (await regularConflict(tx, slot.teacherId, studentId, slot.startsAt, slot.endsAt)) throw new HttpError(409, "Teacher or student already has a lesson at this time");
        await checkTrialConflict(tx, slot.teacherId, studentId, slot.startsAt, slot.endsAt);
        return tx.trialRequest.upsert({ where: { slotId_studentId: { slotId: slot.id, studentId } }, create: { slotId: slot.id, studentId }, update: { status: "pending" }, include: requestInclude });
      });
      set.status = 201; return result;
    }, { body: z.strictObject({ slotId: z.union([z.uuid(), z.string().regex(/^auto:[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}:(10|1[6-9]|2[0-3])$/)]) }) })
    .patch("/api/trial-requests/:id", async ({ request, params, body }) => {
      const actor = await actorFor(request);
      const owned = actor.role === "student" ? { studentId: student(actor) } : { slot: management(actor) };
      if (actor.role === "student" && body.status !== "cancelled") throw new HttpError(403, "Only a teacher or administrator can approve requests");
      return db.$transaction(async tx => {
        await scheduleLock(tx);
        const trial = await tx.trialRequest.findFirst({ where: { id: params.id, ...owned }, include: { slot: true } });
        if (!trial) throw new HttpError(404, "Trial request not found");
        if (!held.includes(trial.status) || (body.status !== "cancelled" && trial.status !== "pending")) throw new HttpError(409, "This request has already been resolved");
        if (body.status === "approved") {
          const slot = trial.slot;
          const person = await tx.student.findUnique({ where: { id: trial.studentId } });
          const course = await tx.course.findUnique({ where: { id: slot.courseId } });
          if (!slot.active || !course?.active || person?.status !== "active" || slot.startsAt <= new Date()) throw new HttpError(409, "This trial can no longer be approved");
          if (await regularConflict(tx, slot.teacherId, trial.studentId, slot.startsAt, slot.endsAt)) throw new HttpError(409, "Teacher or student already has a lesson at this time");
          await checkTrialConflict(tx, slot.teacherId, trial.studentId, slot.startsAt, slot.endsAt, trial.id);
        }
        return tx.trialRequest.update({ where: { id: trial.id }, data: { status: body.status }, include: requestInclude });
      });
    }, { params: z.object({ id: z.uuid() }), body: z.strictObject({ status: z.enum(["approved", "declined", "cancelled"]) }) });
}
