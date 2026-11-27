import { setAuditActor } from "../../shared/audit";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { HttpError, requireAdmin, type Actor } from "../../shared/authorization";
import { checkConflict, dates, reminder, scheduleLock, serialize, storedBounds } from "../lessons/service";
import { calendarOpenings } from "./calendar";
import { workingRanges } from "../../teacher-hours";
import { lessonSchedule, studentName } from "../../shared/lesson-notification";
import { notifyWithPush } from "../../push-queue";

const OFFSET = 4 * 3600000;
export function bakuMonth(now: Date) {
  const civil = new Date(now.getTime() + OFFSET);
  return { start: new Date(Date.UTC(civil.getUTCFullYear(), civil.getUTCMonth(), 1) - OFFSET), end: new Date(Date.UTC(civil.getUTCFullYear(), civil.getUTCMonth() + 1, 1) - OFFSET) };
}
const include = { enrollment: { include: { student: { include: { profile: true } }, course: true } }, teacher: true } as const;
type Booking = Prisma.LessonGetPayload<{ include: typeof include }>;
const absolute = (lesson: Booking) => storedBounds(lesson).map(time => new Date(time - OFFSET));
const slotSchedule = (start: Date, end: Date) => {
  const a = new Date(start.getTime() + OFFSET).toISOString();
  const b = new Date(end.getTime() + OFFSET).toISOString();
  return { date: a.slice(0, 10), endDate: b.slice(0, 10), startTime: a.slice(11, 16), endTime: b.slice(11, 16), allDay: false };
};
function studentId(actor: Actor) {
  if (actor.role !== "student" || !actor.studentId) throw new HttpError(403, "Student access required");
  return actor.studentId;
}
function requestScope(actor: Actor): Prisma.RescheduleRequestWhereInput {
  if (actor.role === "student") return { studentId: studentId(actor) };
  if (actor.role === "teacher") {
    if (!actor.teacherId) throw new HttpError(403, "Teacher account is incomplete");
    return { lesson: { teacherId: actor.teacherId } };
  }
  requireAdmin(actor);
  return {};
}
async function owned(tx: Prisma.TransactionClient, actor: Actor, id: string) {
  const lesson = await tx.lesson.findFirst({ where: { id, enrollment: { studentId: studentId(actor), student: { status: "active" } } }, include });
  if (!lesson) throw new HttpError(404, "Lesson not found");
  return lesson;
}
function future(lesson: Booking) {
  if (lesson.status !== "scheduled" || absolute(lesson)[0]!.getTime() <= Date.now()) throw new HttpError(409, "Only upcoming confirmed lessons can be changed");
}
async function quota(tx: Prisma.TransactionClient, id: string) {
  const month = bakuMonth(new Date());
  const used = await tx.rescheduleRequest.count({ where: { studentId: id, quotaWaived: false, createdAt: { gte: month.start, lt: month.end } } });
  return { used, limit: 3, remaining: Math.max(0, 3 - used), resetsAt: month.end };
}
async function notify(tx: Prisma.TransactionClient, users: string[], title: string, message: string, lesson: Booking) {
  await notifyWithPush(tx, [...new Set(users)].map(userId => ({ userId, title: userId === lesson.teacher.profileId ? `${title}: ${studentName(lesson.enrollment.student.profile)}` : title, message, type: "lesson_reschedule" })));
}
async function candidate(tx: Prisma.TransactionClient, lesson: Booking, slotId: string) {
  const slot = await tx.availabilitySlot.findFirst({ where: { id: slotId, teacherId: lesson.teacherId, courseId: lesson.enrollment.courseId, active: true, startsAt: { gt: new Date() } } });
  if (!slot) throw new HttpError(409, "This teacher availability is no longer available");
  const [originalStart, originalEnd] = absolute(lesson);
  if (lesson.allDay || !lesson.endTime) throw new HttpError(422, "Ask your school to reschedule an all-day or open-ended lesson");
  const endsAt = new Date(slot.startsAt.getTime() + originalEnd!.getTime() - originalStart!.getTime());
  if (endsAt > slot.endsAt) throw new HttpError(409, "This available time is too short for your lesson");
  if (+slot.startsAt === +originalStart!) throw new HttpError(422, "Choose a different lesson time");
  const schedule = slotSchedule(slot.startsAt, endsAt);
  await checkConflict(tx, { studentId: lesson.enrollment.studentId, teacherId: lesson.teacherId }, dates(schedule), [lesson.id]);
  return { slot, endsAt, schedule, originalStart: originalStart!, originalEnd: originalEnd! };
}

async function calendarCandidate(tx: Prisma.TransactionClient, lesson: Booking, value: string) {
  const start = new Date(value), now = new Date();
  const [originalStart, originalEnd] = absolute(lesson);
  if (lesson.allDay || !lesson.endTime) throw new HttpError(422, "Ask your school to set this lesson’s duration before rescheduling");
  const end = new Date(+start + +originalEnd! - +originalStart!);
  if (!Number.isFinite(+start) || start <= now || +start > +now + 56 * 86400000 || +start % 1800000 !== 0) throw new HttpError(422, "Choose a future :00 or :30 start within the next 8 weeks");
  const teacher = await tx.teacher.findUnique({ where: { id: lesson.teacherId }, select: { profile: { select: { firstName: true } } } });
  const date = new Date(+start + OFFSET).toISOString().slice(0, 10);
  if (!workingRanges(teacher?.profile.firstName, date).some(range => start >= range.startsAt && end <= range.endsAt)) throw new HttpError(409, "This time is outside the teacher’s working hours");
  if (+start === +originalStart!) throw new HttpError(422, "Choose a different lesson time");
  const schedule = slotSchedule(start, end);
  // Keep the original booking occupied until approval, matching the free-range list.
  await checkConflict(tx, { studentId: lesson.enrollment.studentId, teacherId: lesson.teacherId }, dates(schedule));
  return { slot: { startsAt: start }, endsAt: end, schedule, originalStart: originalStart!, originalEnd: originalEnd! };
}

export function createReschedulingService(db: PrismaClient) {
  const transaction = <T>(actor: Actor, fn: (tx: Prisma.TransactionClient) => Promise<T>) => db.$transaction(async tx => { await setAuditActor(tx, actor); await scheduleLock(tx); return fn(tx); }, { timeout: 30000, isolationLevel: "ReadCommitted" });
  return {
    async options(actor: Actor, lessonId: string, offset = 0) {
      return transaction(actor, async tx => {
        const lesson = await owned(tx, actor, lessonId);
        future(lesson);
        const usage = await quota(tx, lesson.enrollment.studentId);
        const pending = await tx.rescheduleRequest.findFirst({ where: { lessonId, status: "pending" } });
        const [start, end] = absolute(lesson);
        if (lesson.allDay || !lesson.endTime) throw new HttpError(422, "Ask your school to set the lesson duration before rescheduling");
        const availability = await calendarOpenings(tx, lesson.teacherId, lesson.enrollment.studentId, (+end! - +start!) / 60000, offset);
        return { ...availability, quota: usage, pending };
      });
    },
    async request(actor: Actor, lessonId: string, slotId: string) {
      return transaction(actor, async tx => {
        const lesson = await owned(tx, actor, lessonId);
        future(lesson);
        if ((await quota(tx, lesson.enrollment.studentId)).remaining === 0) throw new HttpError(409, "You have used your 3 rescheduling requests this month. Contact your school if a request was made by mistake.");
        if (await tx.rescheduleRequest.findFirst({ where: { lessonId, status: "pending" } })) throw new HttpError(409, "This lesson already has a pending request");
        const fromCalendar = slotId.includes("T");
        const proposed = fromCalendar ? await calendarCandidate(tx, lesson, slotId) : await candidate(tx, lesson, slotId);
        const result = await tx.rescheduleRequest.create({ data: { lessonId, slotId: fromCalendar ? null : slotId, studentId: lesson.enrollment.studentId, teacherId: lesson.teacherId, originalStart: proposed.originalStart, originalEnd: proposed.originalEnd, startsAt: proposed.slot.startsAt, endsAt: proposed.endsAt } });
        const admins = await tx.profile.findMany({ where: { role: "admin" }, select: { id: true } });
        await notify(tx, [lesson.teacher.profileId, ...admins.map(p => p.id)], "Rescheduling request", `${studentName(lesson.enrollment.student.profile)} · ${lesson.enrollment.course.name}. Original: ${lessonSchedule(serialize(lesson))}. Requested: ${lessonSchedule(proposed.schedule)}. Review in Lessons → Rescheduling requests.`, lesson);
        return result;
      });
    },
    async list(actor: Actor, offset: number, status?: "pending") {
      return db.rescheduleRequest.findMany({ where: { ...requestScope(actor), ...(status && { status }) }, include: { lesson: { include: { enrollment: { include: { course: { select: { name: true } }, student: { include: { profile: { select: { firstName: true, lastName: true } } } } } } } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 50, skip: offset });
    },
    async review(actor: Actor, id: string, status: "approved" | "rejected", note?: string, startsAt?: string) {
      if (actor.role !== "admin" && actor.role !== "teacher") throw new HttpError(403, "Teacher or admin access required");
      return transaction(actor, async tx => {
        const request = await tx.rescheduleRequest.findFirst({ where: { id, ...requestScope(actor) }, include: { lesson: { include } } });
        if (!request) throw new HttpError(404, "Request not found");
        if (request.status !== "pending") throw new HttpError(409, "This request has already been reviewed");
        const { lesson } = request;
        const requested = lessonSchedule(slotSchedule(request.startsAt, request.endsAt));
        let updatedTime: { startsAt: Date; endsAt: Date; slotId: null } | undefined;
        if (status === "approved") {
          future(lesson);
          const [start, end] = absolute(lesson);
          if (+start! !== +request.originalStart || +end! !== +request.originalEnd) throw new HttpError(409, "The lesson changed after this request. Reject it and ask the student to submit again.");
          const changedTime = startsAt !== undefined && Date.parse(startsAt) !== +request.startsAt;
          const originalSlotId = !changedTime && lesson.teacherId === request.teacherId ? request.slotId : null;
          const proposed = originalSlotId
            ? await candidate(tx, lesson, originalSlotId)
            : await calendarCandidate(tx, lesson, startsAt ?? request.startsAt.toISOString());
          if (changedTime) {
            updatedTime = { startsAt: proposed.slot.startsAt, endsAt: proposed.endsAt, slotId: null };
          } else if (+proposed.slot.startsAt !== +request.startsAt || +proposed.endsAt !== +request.endsAt) {
            throw new HttpError(409, "Teacher availability changed. Choose another time or reject the request.");
          }
          await tx.lesson.update({ where: { id: lesson.id }, data: { ...dates(proposed.schedule), ...reminder(proposed.schedule, lesson.reminderMinutes), rescheduledAt: new Date(), seriesId: null, repeatRule: PrismaJsonNull(), cancelledByStudent: false } });
        }
        const result = await tx.rescheduleRequest.update({ where: { id }, data: { status, reviewedBy: actor.id, reviewedAt: new Date(), reviewNote: note, ...updatedTime } });
        const outcome = status === "approved"
          ? `Previous: ${lessonSchedule(slotSchedule(request.originalStart, request.originalEnd))}. ${updatedTime ? `Requested: ${requested}. ` : ""}Confirmed: ${lessonSchedule(slotSchedule(result.startsAt, result.endsAt))}.`
          : `Request rejected. Unchanged lesson: ${lessonSchedule(serialize(lesson))}. Requested: ${requested}.`;
        await notify(tx, [lesson.enrollment.student.profileId, lesson.teacher.profileId], `Rescheduling ${status}`, `${studentName(lesson.enrollment.student.profile)} · ${lesson.enrollment.course.name}. ${outcome}${note ? ` Review note: ${note}` : ""}`, lesson);
        return result;
      });
    },
    async waive(actor: Actor, id: string, reason: string) {
      requireAdmin(actor);
      return transaction(actor, async tx => {
        const request = await tx.rescheduleRequest.findUnique({ where: { id } });
        if (!request) throw new HttpError(404, "Request not found");
        return tx.rescheduleRequest.update({ where: { id }, data: { quotaWaived: true, waivedBy: actor.id, waivedAt: new Date(), waiverReason: reason } });
      });
    },
    async cancel(actor: Actor, id: string) {
      return transaction(actor, async tx => {
        const lesson = await owned(tx, actor, id);
        if (lesson.status === "cancelled") return serialize(lesson);
        future(lesson);
        await tx.rescheduleRequest.updateMany({ where: { lessonId: id, status: "pending" }, data: { status: "cancelled", reviewedAt: new Date(), reviewedBy: actor.id, reviewNote: "Student cancelled the lesson" } });
        const result = await tx.lesson.update({ where: { id }, data: { status: "cancelled", cancelledByStudent: true, reminderAt: null } });
        const admins = await tx.profile.findMany({ where: { role: "admin" }, select: { id: true } });
        await notify(tx, [lesson.teacher.profileId, ...admins.map(p => p.id)], "Lesson cancelled by student", `${studentName(lesson.enrollment.student.profile)} · ${lesson.enrollment.course.name} · ${lessonSchedule(serialize(lesson))}. Admins can restore a mistaken cancellation in Lessons.`, lesson);
        return serialize(result);
      });
    },
    async cancellations(actor: Actor, offset: number) {
      requireAdmin(actor);
      return (await db.lesson.findMany({ where: { status: "cancelled", cancelledByStudent: true }, include: { enrollment: { include: { course: { select: { name: true } }, student: { include: { profile: { select: { firstName: true, lastName: true } } } } } } }, orderBy: [{ date: "desc" }, { id: "asc" }], take: 50, skip: offset })).map(serialize);
    },
    async restore(actor: Actor, id: string) {
      requireAdmin(actor);
      return transaction(actor, async tx => {
        const lesson = await tx.lesson.findUnique({ where: { id }, include });
        if (!lesson || lesson.status !== "cancelled" || !lesson.cancelledByStudent) throw new HttpError(409, "Only a student-cancelled lesson can be restored here");
        if (absolute(lesson)[0]! <= new Date()) throw new HttpError(409, "This lesson time has passed; arrange a new lesson instead");
        const schedule = serialize(lesson);
        if (!schedule.endTime) throw new HttpError(422, "Set an end time before restoring this lesson");
        const input = { ...schedule, endTime: schedule.endTime };
        await checkConflict(tx, { studentId: lesson.enrollment.studentId, teacherId: lesson.teacherId }, dates(input), [id]);
        const result = await tx.lesson.update({ where: { id }, data: { status: "scheduled", cancelledByStudent: false, ...reminder(input, lesson.reminderMinutes) } });
        await notify(tx, [lesson.enrollment.student.profileId, lesson.teacher.profileId], "Lesson restored", `${studentName(lesson.enrollment.student.profile)} · ${lesson.enrollment.course.name} · ${lessonSchedule(schedule)}. Your admin restored the cancelled lesson.`, lesson);
        return serialize(result);
      });
    },
  };
}

// Imported as a runtime value separately to keep Prisma client types explicit.
import { Prisma as RuntimePrisma } from "../../generated/prisma/client";
const PrismaJsonNull = () => RuntimePrisma.DbNull;
