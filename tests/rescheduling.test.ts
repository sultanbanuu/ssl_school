import { expect, test } from "bun:test";
import { bakuMonth, createReschedulingService } from "../src/modules/rescheduling/service";
import { dates, serialize } from "../src/modules/lessons/service";
import type { Actor } from "../src/shared/authorization";
import type { PrismaClient } from "../src/generated/prisma/client";

const student: Actor = { id: "student-profile", role: "student", studentId: "student", teacherId: null };
const teacher: Actor = { id: "teacher-profile", role: "teacher", teacherId: "teacher", studentId: null };
const admin: Actor = { id: "admin", role: "admin", studentId: null, teacherId: null };
function matches(row: any, where: any): boolean {
  return Object.entries(where || {}).every(([key, value]: [string, any]) => {
    if (key === "OR") return value.some((part: any) => matches(row, part));
    if (key === "AND") return value.every((part: any) => matches(row, part));
    const actual = row?.[key];
    if (value === null) return actual == null;
    if (typeof value !== "object" || value instanceof Date) return actual === value || actual instanceof Date && +actual === +value;
    if ("notIn" in value) return !value.notIn.includes(actual);
    if ("in" in value) return value.in.includes(actual);
    if (["gte", "gt", "lte", "lt"].some(k => k in value)) return actual != null && (!("gte" in value) || actual >= value.gte) && (!("gt" in value) || actual > value.gt) && (!("lte" in value) || actual <= value.lte) && (!("lt" in value) || actual < value.lt);
    return matches(actual, value);
  });
}
function fixture() {
  const enrollment = { studentId: "student", courseId: "course", student: { profileId: student.id, status: "active" }, course: { name: "English" } };
  const lessons: any[] = [{ id: "lesson", teacherId: "teacher", enrollment, ...dates({ date: "2099-11-02", startTime: "10:00", endTime: "11:00" }), status: "scheduled", allDay: false, reminderMinutes: 10, teacher: { profileId: teacher.id } }];
  const slots: any[] = [{ id: "slot", purpose: "reschedule", teacherId: "teacher", courseId: "course", startsAt: new Date("2099-11-04T12:00:00+04:00"), endsAt: new Date("2099-11-04T14:00:00+04:00"), active: true }];
  const requests: any[] = [], notifications: any[] = [];
  let trialConflict = false;
  const many = (rows: any[], args: any) => rows.filter(row => matches(row, args.where)).slice(args.skip || 0, (args.skip || 0) + (args.take ?? rows.length));
  let queue = Promise.resolve();
  const db: any = {
    teacher: { findMany: async () => [], findUnique: async () => ({ profile: { firstName: "Sayad" } }) },
    $queryRaw: async () => [],
    $executeRaw: async () => 0,
    $transaction: async (fn: any) => {
      let release!: () => void;
      const next = new Promise<void>(resolve => { release = resolve; }); const previous = queue; queue = next; await previous;
      const saved = structuredClone({ lessons, requests, notifications });
      try { return await fn(db); } catch (e) { lessons.splice(0, lessons.length, ...saved.lessons); requests.splice(0, requests.length, ...saved.requests); notifications.splice(0, notifications.length, ...saved.notifications); throw e; } finally { release(); }
    },
    lesson: {
      findFirst: async ({ where }: any) => lessons.find(l => matches(l, where)) || null,
      findUnique: async ({ where }: any) => lessons.find(l => l.id === where.id) || null,
      findUniqueOrThrow: async ({ where }: any) => lessons.find(l => l.id === where.id),
      findMany: async (args: any) => many(lessons, args),
      update: async ({ where, data }: any) => { const l = lessons.find(l => l.id === where.id); Object.assign(l, data); return l; },
    },
    course: { findUnique: async ({ where }: any) => where.id === "course" ? { id: "course", active: true, teacherId: "teacher" } : null },
    availabilitySlot: { findFirst: async ({ where }: any) => slots.find(l => matches(l, where)) || null, findMany: async (args: any) => many(slots, args), create: async ({ data }: any) => { const row = { id: crypto.randomUUID(), active: true, ...data }; slots.push(row); return row; }, update: async ({ where, data }: any) => { const row = slots.find(s => s.id === where.id); Object.assign(row, data); return row; } },
    trialRequest: { findFirst: async () => trialConflict ? { id: "trial" } : null, findMany: async () => [] },
    profile: { findMany: async () => [{ id: "admin" }] },
    notification: { createMany: async ({ data }: any) => { notifications.push(...data); return { count: data.length }; } },
    rescheduleRequest: {
      count: async ({ where }: any) => requests.filter(r => matches(r, where)).length,
      findFirst: async ({ where }: any) => requests.find(r => matches(r, where)) || null,
      findUnique: async ({ where }: any) => requests.find(r => r.id === where.id) || null,
      findMany: async (args: any) => many(requests, args).map(r => ({ ...r, lesson: lessons.find(l => l.id === r.lessonId) })),
      create: async ({ data }: any) => { const r = { id: crypto.randomUUID(), createdAt: new Date(), status: "pending", quotaWaived: false, ...data }; requests.push(r); return r; },
      update: async ({ where, data }: any) => { const r = requests.find(r => r.id === where.id); Object.assign(r, data); return r; },
      updateMany: async ({ where, data }: any) => { const rows = requests.filter(r => matches(r, where)); rows.forEach(r => Object.assign(r, data)); return { count: rows.length }; },
    },
  };
  return { s: createReschedulingService(db as PrismaClient), lessons, slots, requests, notifications, trial: () => { trialConflict = true; } };
}
test("Baku monthly boundary rolls over at 20:00 UTC and handles year rollover", () => {
  expect(bakuMonth(new Date("2026-10-31T19:59:59Z")).end.toISOString()).toBe("2026-10-31T20:00:00.000Z");
  expect(bakuMonth(new Date("2026-10-31T20:00:00Z")).start.toISOString()).toBe("2026-10-31T20:00:00.000Z");
  expect(bakuMonth(new Date("2026-12-31T21:00:00Z")).end.toISOString()).toBe("2027-01-31T20:00:00.000Z");
});
test("request preserves original booking; assigned teacher approval moves one lesson and resets reminder", async () => {
  const f = fixture();
  const options = await f.s.options(student, "lesson");
  expect(options.items.length).toBeGreaterThan(0); expect(options.quota.remaining).toBe(3);
  expect(options.lessonMinutes).toBe(60);
  const r = await f.s.request(student, "lesson", "slot");
  expect(serialize(f.lessons[0]).date).toBe("2099-11-02");
  await f.s.review(teacher, r.id, "approved");
  expect(serialize(f.lessons[0]).date).toBe("2099-11-04");
  expect(serialize(f.lessons[0]).startTime).toBe("12:00");
  expect(f.lessons[0].status).toBe("scheduled"); expect(f.lessons[0].rescheduledAt).toBeInstanceOf(Date);
  expect(f.lessons[0].reminderAt.toISOString()).toBe("2099-11-04T07:50:00.000Z");
  expect(f.notifications.some(n => n.userId === student.id && n.title === "Rescheduling approved")).toBe(true);
  await expect(f.s.review(teacher, r.id, "approved")).rejects.toThrow("already been reviewed");
});
test("three submitted requests limit applies to rejected requests; admin waiver restores access; cancellation is unrestricted", async () => {
  const f = fixture();
  for (let i = 0; i < 3; i++) { const r = await f.s.request(student, "lesson", "slot"); await f.s.review(admin, r.id, "rejected"); }
  await expect(f.s.request(student, "lesson", "slot")).rejects.toThrow("3 rescheduling requests");
  await expect(f.s.waive(teacher, f.requests[0].id, "Mistake")).rejects.toThrow("Admin access");
  await f.s.waive(admin, f.requests[0].id, "Accidental duplicate request");
  expect((await f.s.options(student, "lesson")).quota.remaining).toBe(1);
  await f.s.request(student, "lesson", "slot");
  await f.s.cancel(student, "lesson");
  expect(f.lessons[0].status).toBe("cancelled"); expect(f.requests[3].status).toBe("cancelled");
  await f.s.cancel(student, "lesson"); // Idempotent, no quota needed.
  await expect(f.s.restore(teacher, "lesson")).rejects.toThrow("Admin access");
  await f.s.restore(admin, "lesson"); expect(f.lessons[0].status).toBe("scheduled");
  await f.s.cancel(student, "lesson"); expect(f.lessons[0].status).toBe("cancelled");
});
test("ownership, assigned teacher, and manager restrictions protect requests", async () => {
  const f = fixture();
  await expect(f.s.request({ ...student, studentId: "other" }, "lesson", "slot")).rejects.toThrow("not found");
  const r = await f.s.request(student, "lesson", "slot");
  await expect(f.s.review(student, r.id, "approved")).rejects.toThrow("Teacher or admin");
  await expect(f.s.review({ ...teacher, teacherId: "other" }, r.id, "approved")).rejects.toThrow("not found");
  await expect(f.s.review({ ...admin, role: "manager" }, r.id, "approved")).rejects.toThrow("Teacher or admin");
  expect(await f.s.list({ ...student, studentId: "other" }, 0)).toHaveLength(0);
});
test("conflicts and changed availability are revalidated at approval", async () => {
  const f = fixture(); const r = await f.s.request(student, "lesson", "slot");
  f.trial(); await expect(f.s.review(admin, r.id, "approved")).rejects.toThrow("trial");
  expect(f.requests[0].status).toBe("pending"); expect(serialize(f.lessons[0]).date).toBe("2099-11-02");
  const g = fixture(); const q = await g.s.request(student, "lesson", "slot");
  g.slots[0].startsAt = new Date("2099-11-04T12:30:00+04:00");
  await expect(g.s.review(admin, q.id, "approved")).rejects.toThrow("availability changed");
  const h = fixture(); const t = await h.s.request(student, "lesson", "slot");
  h.lessons[0].startTime = new Date("1970-01-01T09:00:00Z");
  await expect(h.s.review(admin, t.id, "approved")).rejects.toThrow("lesson changed");
});
test("wrong teacher/course, short slots, occupied times, and expired lessons are excluded", async () => {
  const f = fixture(); f.slots.push({ ...f.slots[0], id: "wrong", teacherId: "other" });
  await expect(f.s.request(student, "lesson", "wrong")).rejects.toThrow("no longer available");
  f.slots[0].endsAt = new Date("2099-11-04T12:15:00+04:00");
  const shortOpenings = (await f.s.options(student, "lesson")).items;
  expect(shortOpenings.length).toBeGreaterThan(0);
  expect(shortOpenings.every(item => item.canReschedule)).toBe(true);
  const g = fixture(); g.lessons.push({ ...g.lessons[0], id: "occupied", ...dates({ date: "2099-11-04", startTime: "12:15", endTime: "13:15" }) });
  await expect(g.s.request(student, "lesson", "slot")).rejects.toThrow("already has a lesson");
  const h = fixture(); h.lessons[0].date = new Date("2020-01-01");
  await expect(h.s.cancel(student, "lesson")).rejects.toThrow("Only upcoming");
});
test("simultaneous duplicate submissions produce only one pending request", async () => {
  const f = fixture(); const results = await Promise.allSettled([f.s.request(student, "lesson", "slot"), f.s.request(student, "lesson", "slot")]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(f.requests).toHaveLength(1);
});
test("restore checks schedule conflicts and leaves cancellation intact on failure", async () => {
  const f = fixture(); await f.s.cancel(student, "lesson");
  f.lessons.push({ ...f.lessons[0], id: "replacement", status: "scheduled" });
  await expect(f.s.restore(admin, "lesson")).rejects.toThrow("already has a lesson");
  expect(f.lessons[0].status).toBe("cancelled");
});
test("one remaining quota cannot be spent concurrently on different lessons", async () => {
  const f = fixture();
  for (let i = 0; i < 2; i++) { const r = await f.s.request(student, "lesson", "slot"); await f.s.review(admin, r.id, "rejected"); }
  f.lessons.push({ ...f.lessons[0], id: "second", ...dates({ date: "2099-11-03", startTime: "10:00", endTime: "11:00" }) });
  const results = await Promise.allSettled([f.s.request(student, "lesson", "slot"), f.s.request(student, "second", "slot")]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(f.requests).toHaveLength(3);
});
test("requests in a previous Baku month do not consume this month's quota", async () => {
  const f = fixture();
  const r = await f.s.request(student, "lesson", "slot"); await f.s.review(admin, r.id, "rejected");
  f.requests[0].createdAt = new Date(+bakuMonth(new Date()).start - 1);
  expect((await f.s.options(student, "lesson")).quota.remaining).toBe(3);
});
test("existing teacher availability remains visible and full-length legacy slots can be requested", async () => {
  const f = fixture();
  f.slots[0].purpose = "trial";
  const options = await f.s.options(student, "lesson");
  expect(options.items.length).toBeGreaterThan(0); expect(options.items[0]!.canReschedule).toBe(true);
  const request = await f.s.request(student, "lesson", "slot");
  expect(request.status).toBe("pending");
});
test("calendar free time is independent of old manually published course slots", async () => {
  const f = fixture(); f.slots[0].courseId = "another-course";
  const options = await f.s.options(student, "lesson");
  expect(options.items[0]!.canReschedule).toBe(true);
  await expect(f.s.request(student, "lesson", "slot")).rejects.toThrow("no longer available");
});
test("calendar request works without a published slot and approval rechecks live lessons", async () => {
  const f = fixture(); f.slots.splice(0);
  // Use next week so the first range is not clipped to the current minute.
  const options = await f.s.options(student, "lesson", 7);
  const range = options.items[0]!;
  const request = await f.s.request(student, "lesson", range.startsAt.toISOString());
  expect(request.slotId).toBeNull(); expect(f.slots).toHaveLength(0);
  const start = new Date(+range.startsAt + 4 * 3600000).toISOString();
  const end = new Date(+range.startsAt + 5 * 3600000).toISOString();
  f.lessons.push({ ...f.lessons[0], id: "conflict", ...dates({ date: start.slice(0, 10), startTime: start.slice(11, 16), endTime: end.slice(11, 16) }) });
  await expect(f.s.review(teacher, request.id, "approved")).rejects.toThrow("already has a lesson");
  f.lessons.pop();
  await f.s.review(teacher, request.id, "approved");
  expect(serialize(f.lessons[0]).startTime).toBe(start.slice(11, 16));
});
test("student cannot request a calendar time outside Sayad working hours", async () => {
  const f = fixture(); const options = await f.s.options(student, "lesson");
  const date = new Date(+options.items[0]!.startsAt + 86400000 + 4 * 3600000).toISOString().slice(0, 10);
  await expect(f.s.request(student, "lesson", `${date}T11:30:00+04:00`)).rejects.toThrow("working hours");
});

