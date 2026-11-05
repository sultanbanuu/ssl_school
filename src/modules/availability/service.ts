import { setAuditActor } from "../../shared/audit";
import type { z } from "zod";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { DAY, addDays, timeString } from "../../scheduling";
import { HttpError, requireStaff, type Actor } from "../../shared/authorization";
import { checkTrialConflict } from "../../trial-conflicts";
import { scheduleLock, storedBounds } from "../lessons/service";
import { workingMinutes, workingRanges, BAKU_OFFSET } from "../../teacher-hours";
import type {
  listQuery,
  listTrialsQuery,
  removeParams,
  requestTrialBody,
  reviewTrialBody,
  reviewTrialParams,
  slotBody,
  updateBody,
  updateParams,
} from "./schemas";


const names = { select: { firstName: true, lastName: true } } as const;

const slotInclude = {
  teacher: { select: { id: true, profile: names } },
  course: { select: { id: true, name: true } },
} as const;

const requestInclude = {
  slot: { include: slotInclude },
  student: { select: { profile: names } },
} as const;

const held = ["pending", "approved"];

function management(actor: Actor) {
  if (actor.role === "teacher") {
    if (!actor.teacherId)
      throw new HttpError(403, "Teacher account is incomplete");
    return { teacherId: actor.teacherId };
  }
  requireStaff(actor);
  return {};
}

function student(actor: Actor) {
  if (actor.role !== "student" || !actor.studentId)
    throw new HttpError(403, "Student access required");
  return actor.studentId;
}

const times = (body: z.infer<typeof slotBody>) => ({
  startsAt: new Date(`${body.date}T${body.startTime}:00+04:00`),
  endsAt: new Date(`${body.date}T${body.endTime}:00+04:00`),
});

async function regularCandidates(
  tx: Pick<Prisma.TransactionClient, "lesson">,
  teacherIds: string[],
  studentId: string | undefined,
  startsAt: Date,
  endsAt: Date,
) {
  const date = new Date(
    Math.floor((endsAt.getTime() + 4 * 3600000) / DAY) * DAY,
  );
  const from = new Date(
    Math.floor((startsAt.getTime() + 4 * 3600000) / DAY) * DAY,
  );
  return tx.lesson.findMany({
    where: {
      status: { notIn: ["cancelled", "rescheduled"] },
      date: { lte: date },
      AND: [
        {
          OR: [
            { endDate: { gte: from } },
            { endDate: null, date: { gte: from } },
          ],
        },
      ],
      OR: [
        { teacherId: { in: teacherIds } },
        ...(studentId ? [{ enrollment: { studentId } }] : []),
      ],
    },
    include: { enrollment: { select: { studentId: true } } },
  });
}

export async function regularConflict(
  tx: Pick<Prisma.TransactionClient, "lesson">,
  teacherId: string,
  studentId: string | undefined,
  startsAt: Date,
  endsAt: Date,
) {
  const rows = await regularCandidates(
    tx,
    [teacherId],
    studentId,
    startsAt,
    endsAt,
  );
  return rows.some((row) => overlapsLesson(row, startsAt, endsAt));
}

function overlapsLesson(
  row: Parameters<typeof storedBounds>[0],
  startsAt: Date,
  endsAt: Date,
) {
  const [a, b] = storedBounds(row);
  return (
    a - 4 * 3600000 < endsAt.getTime() && b - 4 * 3600000 > startsAt.getTime()
  );
}

async function validateSlot(
  tx: Prisma.TransactionClient,
  actor: Actor,
  body: z.infer<typeof slotBody>,
  id?: string,
) {
  const owned = management(actor);
  if ("teacherId" in owned && body.teacherId !== owned.teacherId)
    throw new HttpError(403, "Publish availability only for yourself");
  const course = await tx.course.findUnique({ where: { id: body.courseId } });
  if (!course?.active || course.teacherId !== body.teacherId)
    throw new HttpError(
      422,
      "Choose an active course belonging to this teacher",
    );
  const range = times(body);
  if (range.startsAt <= new Date())
    throw new HttpError(422, "Choose a future time");
  if (
    await regularConflict(
      tx,
      body.teacherId,
      undefined,
      range.startsAt,
      range.endsAt,
    )
  )
    throw new HttpError(409, "Teacher already has a lesson at this time");
  const overlap = await tx.availabilitySlot.findFirst({
    where: {
      teacherId: body.teacherId,
      active: true,
      startsAt: { lt: range.endsAt },
      endsAt: { gt: range.startsAt },
      ...(id ? { id: { not: id } } : {}),
    },
  });
  if (overlap)
    throw new HttpError(409, "This time overlaps another availability slot");
  return range;
}

// Stable variation avoids moving appointment times on every refresh.
export function trialMinute(date: string, hour: number) {
  let hash = hour;
  for (const c of date) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return hour * 60 + (hash % (hour === 23 ? 2 : 4)) * 15;
}

export async function openings(
  db: Pick<Prisma.TransactionClient, "teacher" | "lesson" | "availabilitySlot">,
  actor: Actor,
  from: string,
  to: string,
  teacherId?: string,
) {
  const teachers = await db.teacher.findMany({
    where: {
      ...(teacherId ? { id: teacherId } : actor.role === "teacher" ? { id: actor.teacherId! } : {}),
      profile: { firstName: { equals: "Sayad", mode: "insensitive" } },
    },
    include: {
      profile: names,
      courses: { where: { active: true }, orderBy: { id: "asc" }, take: 1 },
    },
  });
  const result = [];
  for (const teacher of teachers) {
    const course = teacher.courses[0];
    if (!course) continue;
    const begin = new Date(from + "T00:00:00+04:00"),
      end = new Date(new Date(to + "T00:00:00+04:00").getTime() + DAY);
    const lessons = await regularCandidates(
      db,
      [teacher.id],
      actor.role === "student" ? actor.studentId! : undefined,
      begin,
      end,
    );
    const existing = await db.availabilitySlot.findMany({
      where: {
        teacherId: teacher.id,
        startsAt: { lt: end },
        endsAt: { gt: begin },
      },
    });
    for (let date = from;date <= to;date = addDays(date, 1)) {
      if (new Date(date + "T12:00:00Z").getUTCDay() === 0) continue;
      const windows = workingMinutes(teacher.profile.firstName, date);
      const hours = windows.flatMap(([start, end]) => Array.from({ length: Math.ceil(end / 60) - Math.floor(start / 60) }, (_, i) => Math.floor(start / 60) + i));
      for (const hour of hours) {
        const window = windows.find(([start, end]) => hour * 60 < end && (hour + 1) * 60 > start)!;
        const minute = Math.max(window[0], trialMinute(date, hour)),
          startsAt = new Date(`${date}T${timeString(minute)}:00+04:00`),
          endsAt = new Date(startsAt.getTime() + 15 * 60000);
        if (
          minute + 15 > window[1] || startsAt <= new Date() ||
          lessons.some((l) => overlapsLesson(l, startsAt, endsAt)) ||
          existing.some((s) => s.startsAt < endsAt && s.endsAt > startsAt)
        )
          continue;
        result.push({
          id: `auto:${teacher.id}:${date}:${hour}`,
          teacherId: teacher.id,
          courseId: course.id,
          startsAt,
          endsAt,
          active: true,
          teacher: { id: teacher.id, profile: teacher.profile },
          course: { id: course.id, name: course.name },
        });
      }
    }
  }
  return result;
}
export function createAvailabilityService(db: PrismaClient) {
  return {
    async list(
      actor: Actor,
      query: z.output<typeof listQuery>,
    ) {
      const isStudent = actor.role === "student";
      if (isStudent) student(actor);
      const rows = await db.availabilitySlot.findMany({
        where: {
          purpose: { not: "reschedule" },
          ...(isStudent
            ? {
              teacher: { profile: { firstName: { equals: "Sayad", mode: "insensitive" } } },
              active: true,
              course: { active: true },
              requests: { none: { status: { in: held } } },
            }
            : management(actor)),
          startsAt: {
            gte: new Date(
              Math.max(
                isStudent ? Date.now() : 0,
                new Date(query.from + "T00:00:00+04:00").getTime(),
              ),
            ),
            lt: new Date(
              new Date(query.to + "T00:00:00+04:00").getTime() + DAY,
            ),
          },
        },
        include: {
          ...slotInclude,
          requests: {
            where: { status: { in: held } },
            select: {
              id: true,
              status: true,
              student: { select: { profile: names } },
            },
          },
        },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        take: query.limit,
        skip: query.offset,
      });
      const lessons = rows.length
        ? await regularCandidates(
          db,
          [...new Set(rows.map((row) => row.teacherId))],
          isStudent ? actor.studentId! : undefined,
          new Date(query.from + "T00:00:00+04:00"),
          new Date(new Date(query.to + "T00:00:00+04:00").getTime() + DAY),
        )
        : [];
      const items = [];
      for (const { requests, ...row } of rows) {
        const date = new Date(+row.startsAt + BAKU_OFFSET).toISOString().slice(0, 10);
        if (isStudent && !workingRanges("Sayad", date).some(range => row.startsAt >= range.startsAt && row.endsAt <= range.endsAt)) continue;
        const conflict = lessons.some(
          (lesson) =>
            (lesson.teacherId === row.teacherId ||
              (isStudent &&
                lesson.enrollment.studentId === actor.studentId)) &&
            overlapsLesson(lesson, row.startsAt, row.endsAt),
        );
        if (isStudent && conflict) continue;
        items.push({
          ...row,
          ...(isStudent
            ? {}
            : { reservation: requests[0] || null, conflict }),
        });
      }
      const generated =
        query.offset === 0
          ? await openings(db, actor, query.from, query.to)
          : [];
      return {
        items: [
          ...items.filter(
            (row) =>
              !isStudent ||
              row.teacher.profile.firstName?.toLowerCase() === "sayad",
          ),
          ...generated,
        ],
        hasMore: rows.length === query.limit,
      };
    },

    async create(
      actor: Actor,
      body: z.output<typeof slotBody>,
    ) {
      management(actor);
      const result = await db.$transaction(async (tx) => {
          await setAuditActor(tx, actor);
        await scheduleLock(tx);
        const range = await validateSlot(tx, actor, body);
        return tx.availabilitySlot.create({
          data: {
            teacherId: body.teacherId,
            courseId: body.courseId,
            ...range,
          },
          include: slotInclude,
        });
      });
      return result;
    },

    async update(
      actor: Actor,
      params: z.output<typeof updateParams>,
      body: z.output<typeof updateBody>,
    ) {
      const owned = management(actor);
      return db.$transaction(async (tx) => {
          await setAuditActor(tx, actor);
        await scheduleLock(tx);
        const slot = await tx.availabilitySlot.findFirst({
          where: { id: params.id, ...owned },
        });
        if (!slot) throw new HttpError(404, "Availability not found");
        const reservations = await tx.trialRequest.findMany({
          where: { slotId: slot.id, status: { in: held } },
        });
        if ("active" in body)
          await tx.trialRequest.updateMany({
            where: { slotId: slot.id, status: { in: held } },
            data: { status: "cancelled" },
          });
        else
          for (const reservation of reservations) {
            const range = times(body);
            if (
              await regularConflict(
                tx,
                body.teacherId,
                reservation.studentId,
                range.startsAt,
                range.endsAt,
              )
            )
              throw new HttpError(
                409,
                "Student or teacher already has a lesson at this time",
              );
            await checkTrialConflict(
              tx,
              body.teacherId,
              reservation.studentId,
              range.startsAt,
              range.endsAt,
              reservation.id,
            );
          }

        const data =
          "active" in body
            ? { active: false }
            : {
              ...(await validateSlot(tx, actor, body, slot.id)),
              teacherId: body.teacherId,
              courseId: body.courseId,
              active: true,
            };
        return tx.availabilitySlot.update({
          where: { id: slot.id },
          data,
          include: slotInclude,
        });
      });
    },

    async remove(
      actor: Actor,
      params: z.output<typeof removeParams>,
    ) {
      if (actor.role !== "teacher" && actor.role !== "admin")
        throw new HttpError(403, "Teacher or administrator access required");
      const owned = management(actor);
      return db.$transaction(async (tx) => {
          await setAuditActor(tx, actor);
        await scheduleLock(tx);
        if (params.id.startsWith("auto:")) {
          const [, teacherId, date] = params.id.split(":");
          if (actor.role === "teacher" && teacherId !== actor.teacherId)
            throw new HttpError(404, "Availability not found");
          const slot = (await openings(tx, actor, date!, date!)).find(
            (s) => s.id === params.id,
          );
          if (!slot)
            throw new HttpError(
              409,
              "This availability has changed. Refresh and try again.",
            );
          // An inactive record prevents this generated time from reappearing.
          await tx.availabilitySlot.create({
            data: {
              teacherId: slot.teacherId,
              courseId: slot.courseId,
              startsAt: slot.startsAt,
              endsAt: slot.endsAt,
              active: false,
            },
          });
        } else {
          const slot = await tx.availabilitySlot.findFirst({
            where: { id: params.id, ...owned },
          });
          if (!slot) throw new HttpError(404, "Availability not found");
          await tx.trialRequest.updateMany({
            where: { slotId: slot.id, status: { in: held } },
            data: { status: "cancelled" },
          });
          // Preserve trial history while removing the time from booking.
          await tx.availabilitySlot.update({
            where: { id: slot.id },
            data: { active: false },
          });
        }
        return { success: true };
      });
    },

    async listTrials(
      actor: Actor,
      query: z.output<typeof listTrialsQuery>,
    ) {
      const where =
        actor.role === "student"
          ? { studentId: student(actor) }
          : { slot: management(actor) };
      return db.trialRequest.findMany({
        where,
        include: requestInclude,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: query.limit,
        skip: query.offset,
      });
    },

    async requestTrial(
      actor: Actor,
      body: z.output<typeof requestTrialBody>,
    ) {
      const studentId = student(actor);
      const result = await db.$transaction(async (tx) => {
          await setAuditActor(tx, actor);
        await scheduleLock(tx);
        const person = await tx.student.findUnique({
          where: { id: studentId },
        });
        if (person?.status !== "active")
          throw new HttpError(403, "An active student account is required");
        let slot;
        if (body.slotId.startsWith("auto:")) {
          const [, , date] = body.slotId.split(":");
          const candidate = (await openings(tx, actor, date!, date!)).find(
            (s) => s.id === body.slotId,
          );
          if (!candidate)
            throw new HttpError(409, "This time is no longer available");
          slot = await tx.availabilitySlot.create({
            data: {
              teacherId: candidate.teacherId,
              courseId: candidate.courseId,
              startsAt: candidate.startsAt,
              endsAt: candidate.endsAt,
            },
          });
        } else
          slot = await tx.availabilitySlot.findFirst({
            where: {
              id: body.slotId,
              purpose: { not: "reschedule" },
              teacher: { profile: { firstName: { equals: "Sayad", mode: "insensitive" } } },
              active: true,
              course: { active: true },
            },
          });
        if (!slot || slot.startsAt <= new Date())
          throw new HttpError(409, "This time is no longer available");
        const date = new Date(+slot.startsAt + BAKU_OFFSET).toISOString().slice(0, 10);
        if (!workingRanges("Sayad", date).some(range => slot.startsAt >= range.startsAt && slot.endsAt <= range.endsAt)) throw new HttpError(409, "This trial is outside Sayad's working hours");
        if (
          await regularConflict(
            tx,
            slot.teacherId,
            studentId,
            slot.startsAt,
            slot.endsAt,
          )
        )
          throw new HttpError(
            409,
            "Teacher or student already has a lesson at this time",
          );
        await checkTrialConflict(
          tx,
          slot.teacherId,
          studentId,
          slot.startsAt,
          slot.endsAt,
        );
        return tx.trialRequest.upsert({
          where: { slotId_studentId: { slotId: slot.id, studentId } },
          create: { slotId: slot.id, studentId },
          update: { status: "pending" },
          include: requestInclude,
        });
      });
      return result;
    },

    async reviewTrial(
      actor: Actor,
      params: z.output<typeof reviewTrialParams>,
      body: z.output<typeof reviewTrialBody>,
    ) {
      const owned =
        actor.role === "student"
          ? { studentId: student(actor) }
          : { slot: management(actor) };
      if (actor.role === "student" && body.status !== "cancelled")
        throw new HttpError(
          403,
          "Only a teacher or administrator can approve requests",
        );
      return db.$transaction(async (tx) => {
          await setAuditActor(tx, actor);
        await scheduleLock(tx);
        const trial = await tx.trialRequest.findFirst({
          where: { id: params.id, ...owned },
          include: { slot: true },
        });
        if (!trial) throw new HttpError(404, "Trial request not found");
        if (
          !held.includes(trial.status) ||
          (body.status !== "cancelled" && trial.status !== "pending")
        )
          throw new HttpError(409, "This request has already been resolved");
        if (body.status === "approved") {
          const slot = trial.slot;
          const person = await tx.student.findUnique({
            where: { id: trial.studentId },
          });
          const course = await tx.course.findUnique({
            where: { id: slot.courseId },
          });
          if (
            !slot.active ||
            !course?.active ||
            person?.status !== "active" ||
            slot.startsAt <= new Date()
          )
            throw new HttpError(409, "This trial can no longer be approved");
          if (
            await regularConflict(
              tx,
              slot.teacherId,
              trial.studentId,
              slot.startsAt,
              slot.endsAt,
            )
          )
            throw new HttpError(
              409,
              "Teacher or student already has a lesson at this time",
            );
          await checkTrialConflict(
            tx,
            slot.teacherId,
            trial.studentId,
            slot.startsAt,
            slot.endsAt,
            trial.id,
          );
        }
        return tx.trialRequest.update({
          where: { id: trial.id },
          data: { status: body.status },
          include: requestInclude,
        });
      });
    }
  };
}
