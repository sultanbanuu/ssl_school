import type { Prisma } from "../../generated/prisma/client";
import { addDays } from "../../scheduling";
import { storedBounds } from "../lessons/service";
import { BAKU_OFFSET, hasWorkingHours, subtractBookings, workingRanges } from "../../teacher-hours";

export async function calendarOpenings(tx: Prisma.TransactionClient, teacherId: string, studentId: string, durationMinutes: number, offset: number, now = new Date()) {
  const teacher = await tx.teacher.findUnique({ where: { id: teacherId }, select: { profile: { select: { firstName: true } } } });
  const configured = hasWorkingHours(teacher?.profile.firstName);
  const today = new Date(+now + BAKU_OFFSET).toISOString().slice(0, 10);
  const from = addDays(today, offset), to = addDays(from, 7);
  const startsAt = new Date(`${from}T00:00:00+04:00`), endsAt = new Date(`${to}T00:00:00+04:00`);
  if (!configured) return { items: [], scheduleConfigured: false, from, to: addDays(to, -1), hasMore: false, nextOffset: offset + 7, lessonMinutes: durationMinutes };
  const lessons = await tx.lesson.findMany({ where: {
    status: { notIn: ["cancelled", "rescheduled"] },
    date: { lt: new Date(`${to}T00:00:00Z`) },
    AND: [{ OR: [{ endDate: { gte: new Date(`${from}T00:00:00Z`) } }, { endDate: null, date: { gte: new Date(`${from}T00:00:00Z`) } }] }],
    OR: [{ teacherId }, { enrollment: { studentId } }],
  } });
  const trials = await tx.trialRequest.findMany({ where: { status: { in: ["pending", "approved"] }, slot: { startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, OR: [{ studentId }, { slot: { teacherId } }] }, include: { slot: true } });
  const bookings = [
    ...lessons.map(row => { const [a, b] = storedBounds(row); return { startsAt: new Date(a - BAKU_OFFSET), endsAt: new Date(b - BAKU_OFFSET) }; }),
    ...trials.map(row => ({ startsAt: row.slot.startsAt, endsAt: row.slot.endsAt })),
  ];
  const windows = Array.from({ length: 7 }, (_, i) => workingRanges(teacher?.profile.firstName, addDays(from, i))).flat();
  const items = subtractBookings(windows, bookings, Math.max(60, durationMinutes), now).map(range => ({ ...range, id: range.startsAt.toISOString(), canReschedule: true }));
  return { items, scheduleConfigured: true, from, to: addDays(to, -1), hasMore: offset + 7 < 56, nextOffset: offset + 7, lessonMinutes: durationMinutes };
}
