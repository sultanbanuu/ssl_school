import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { dates, serialize } from "../src/modules/lessons/service";
import { deliverLessonReminders } from "../src/lesson-reminders";
import { addDays, bounds, movedSlot, occurrences } from "../src/scheduling";
import type { PrismaClient } from "../src/generated/prisma/client";

const enrollmentId = "44444444-4444-4444-8444-444444444444";
const teacherId = "33333333-3333-4333-8333-333333333333";
const alternateTeacherId = "66666666-6666-4666-8666-666666666666";
const otherEnrollmentId = "77777777-7777-4777-8777-777777777777";
const studentId = "22222222-2222-4222-8222-222222222222";
const base = { date: "2026-11-02", startTime: "10:00", endTime: "11:00" };
function matches(row: any, where: any): boolean {
  return Object.entries(where || {}).every(([key, value]: [string, any]) => {
    if (key === "OR") return value.some((part: any) => matches(row, part));
    if (key === "AND") return value.every((part: any) => matches(row, part));
    const actual = row[key];
    if (value === null) return actual == null;
    if (typeof value !== "object" || value instanceof Date) return +actual === +value || actual === value;
    if ("in" in value) return value.in.includes(actual);
    if ("notIn" in value) return !value.notIn.includes(actual);
    if ("gte" in value || "lte" in value || "gt" in value) return actual != null && (!("gte" in value) || actual >= value.gte) && (!("lte" in value) || actual <= value.lte) && (!("gt" in value) || actual > value.gt);
    return matches(actual, value);
  });
}
function fixture(role = "admin", actorTeacherId = teacherId) {
  let rows: any[] = [];
  let notifications: any[] = [];
  const enrollment = { id: enrollmentId, teacherId, studentId, course: { name: "English", active: true }, student: { status: "active", profileId: studentId } };
  const tx = {
    trialRequest: { findFirst: async () => null },
    $executeRaw: async () => 0,
    enrollment: { findUnique: async ({ where }: any) => where.id === otherEnrollmentId ? { ...enrollment, id: otherEnrollmentId, studentId: "another-student" } : enrollment },
    teacher: { findUnique: async ({ where }: any) => [teacherId, alternateTeacherId].includes(where.id) ? { id: where.id } : null },
    lesson: {
      findMany: async (args: any) => rows.filter(row => matches(row, args.where)).slice(args.skip || 0, (args.skip || 0) + (args.take || rows.length)).map(row => args.include?._count ? { ...row, _count: { progress: row.progressCount || 0 } } : row),
      findFirst: async (args: any) => { const row = rows.find(row => matches(row, args.where)); return row ? { ...row, _count: { progress: row.progressCount || 0 } } : null; },
      deleteMany: async ({ where }: any) => { rows = rows.filter(row => !matches(row, where)); return {}; },
      findUniqueOrThrow: async (args: any) => rows.find(row => row.id === args.where.id),
      create: async ({ data }: any) => { const row = { id: crypto.randomUUID(), status: "scheduled", enrollment: data.enrollmentId === otherEnrollmentId ? { ...enrollment, id: otherEnrollmentId, studentId: "another-student" } : enrollment, teacher: { profileId: data.teacherId }, ...data }; rows.push(row); return row; },
      update: async ({ where, data }: any) => { const row = rows.find(row => row.id === where.id); Object.assign(row, data); if (data.teacherId) row.teacher = { profileId: data.teacherId }; return row; },
      updateMany: async ({ where, data }: any) => { rows.filter(row => matches(row, where)).forEach(row => Object.assign(row, data)); return {}; },
    },
    notification: { createMany: async ({ data }: any) => { notifications.push(...data); return { count: data.length }; } },
  };
  const db = { ...tx, profile: { findUnique: async () => ({ id: "actor", role, teacher: role === "teacher" ? { id: actorTeacherId } : null }) }, $transaction: async (fn: any) => { const saved = structuredClone(rows), savedNotifications = structuredClone(notifications); try { return await fn(tx); } catch (e) { rows = saved; notifications = savedNotifications; throw e; } } } as unknown as PrismaClient;
  const app = createApp({ db, getSession: async () => ({ user: { id: "admin" } }), authHandler: async () => new Response(), origins: [] }).compile();
  const request = (method: string, body?: unknown, suffix = "") => app.handle(new Request("http://localhost/api/lessons" + suffix, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));
  const create = (body = {}) => request("POST", { ...base, enrollmentId, ...body });
  return { db, request, create, rows: () => rows, notifications: () => notifications };
}

describe("calendar dates", () => {
  test("weekly selected days use Monday-based week intervals across year boundaries", () => {
    expect(occurrences({ ...base, date: "2026-12-30" }, { frequency: "weekly", interval: 2, weekdays: [1, 3], until: "2027-01-20" }).map(s => s.date)).toEqual(["2026-12-30", "2027-01-11", "2027-01-13"]);
  });
  test("dragging preserves overnight duration and all-day inclusive span", () => {
    expect(movedSlot({ ...base, startTime: "23:00", endTime: "01:00", endDate: "2026-11-03" }, "2026-11-04", "23:30")).toMatchObject({ date: "2026-11-04", endDate: "2026-11-05", endTime: "01:30" });
    const day = { ...base, allDay: true, endDate: "2026-11-04" };
    expect(serialize(dates(day))).toMatchObject({ date: base.date, endDate: "2026-11-04", allDay: true });
    expect(bounds(movedSlot(day, "2026-12-31", "10:00"))[1] - bounds(day)[1]).toBe((Date.parse("2026-12-31") - Date.parse(base.date)));
  });
});
describe("calendar booking transactions", () => {
  test("pending and approved trials prevent conflicting regular lesson creation and moves", async () => {
    const f = fixture();
    await f.create(); const id = f.rows()[0].id;
    (f.db.trialRequest as any).findFirst = async () => ({ id: "reserved-trial" });
    expect((await f.create({ date: "2026-11-03" })).status).toBe(409);
    expect((await f.request("PATCH", { ...base, startTime: "12:00", endTime: "13:00" }, "/" + id)).status).toBe(409);
    expect(f.rows()).toHaveLength(1);
    expect(f.rows()[0].startTime.toISOString().slice(11, 16)).toBe("10:00");
  });
  test("one-occurrence color changes include terminal siblings without altering their schedules or other teachers", async () => {
    const f = fixture("teacher");
    await f.create({ color: "#ad6a82", repeat: { frequency: "daily", interval: 1, until: "2026-11-05" } });
    f.rows()[1].status = "completed"; f.rows()[2].status = "cancelled"; f.rows()[3].teacherId = alternateTeacherId;
    const before = f.rows().map(row => ({ date: row.date, status: row.status }));
    expect((await f.request("PATCH", { ...base, color: "#5096a5", scope: "one" }, "/" + f.rows()[0].id)).status).toBe(200);
    expect(f.rows().map(row => row.color)).toEqual(["#5096a5", "#5096a5", "#5096a5", "#ad6a82"]);
    expect(f.rows().map(row => ({ date: row.date, status: row.status }))).toEqual(before);
    expect((await f.request("PATCH", { ...base, color: null }, "/" + f.rows()[0].id)).status).toBe(200);
    expect(f.rows().slice(0, 3).every(row => row.color === null)).toBe(true);
  });
  test("series deletion is atomic, covers all statuses and stays within teacher ownership", async () => {
    const f = fixture("teacher");
    await f.create({ repeat: { frequency: "daily", interval: 1, until: "2026-11-05" } });
    const id = f.rows()[0].id;
    f.rows()[1].status = "completed";
    f.rows()[2].status = "cancelled";
    f.rows()[2].progressCount = 1;
    f.rows()[3].teacherId = alternateTeacherId;
    const preview = await (await f.request("GET", undefined, "/" + id + "/status-options")).json();
    expect(preview.deleteCount).toBe(3); expect(preview.seriesCount).toBe(1);
    expect((await f.request("DELETE", undefined, "/" + id + "?scope=all")).status).toBe(409);
    expect(f.rows()).toHaveLength(4);
    f.rows()[2].progressCount = 0;
    expect((await f.request("DELETE", undefined, "/" + id + "?scope=invalid")).status).toBe(422);
    expect((await f.request("DELETE", undefined, "/" + id + "?scope=all")).status).toBe(200);
    expect(f.rows()).toHaveLength(1); expect(f.rows()[0].teacherId).toBe(alternateTeacherId);
  });
  test("teachers create only for assigned enrollments and cannot impersonate another teacher", async () => {
    const own = fixture("teacher");
    expect((await own.create()).status).toBe(201);
    expect(own.rows()[0].teacherId).toBe(teacherId);
    expect((await own.create({ teacherId: alternateTeacherId })).status).toBe(403);
    expect((await fixture("teacher", alternateTeacherId).create()).status).toBe(404);
    expect((await fixture("teacher", "").create()).status).toBe(403);
  });
  test("deletion enforces ownership, preserves progress and deletes only one occurrence", async () => {
    const f = fixture("teacher");
    await f.create({ repeat: { frequency: "daily", interval: 1, until: "2026-11-04" } });
    const [first, second, third] = f.rows();
    second.teacherId = alternateTeacherId;
    third.progressCount = 1;
    expect((await f.request("DELETE", undefined, "/" + second.id)).status).toBe(404);
    expect((await f.request("DELETE", undefined, "/" + third.id)).status).toBe(409);
    expect((await f.request("DELETE", undefined, "/" + first.id)).status).toBe(200);
    expect(f.rows().map(row => row.id)).toEqual([second.id, third.id]);
    expect((await f.request("DELETE", undefined, "/" + first.id)).status).toBe(404);
    expect((await fixture("student").request("DELETE", undefined, "/" + first.id)).status).toBe(403);
  });
  test("lesson colors persist across moves, update the whole series, reset and reject invalid values", async () => {
    const f = fixture();
    expect((await f.create({ color: "red" })).status).toBe(422);
    expect((await f.create({ color: "#ad6a82", repeat: { frequency: "daily", interval: 1, until: "2026-11-04" } })).status).toBe(201);
    expect(f.rows().map(row => row.color)).toEqual(["#ad6a82", "#ad6a82", "#ad6a82"]);
    const id = f.rows()[1].id;
    expect((await f.request("PATCH", { ...base, date: "2026-11-03", startTime: "12:00", endTime: "13:00" }, "/" + id)).status).toBe(200);
    expect(f.rows()[1].color).toBe("#ad6a82");
    expect((await f.request("PATCH", { ...base, date: "2026-11-03", color: "#5096a5", scope: "future" }, "/" + id)).status).toBe(200);
    expect(f.rows().map(row => row.color)).toEqual(["#5096a5", "#5096a5", "#5096a5"]);
    expect((await f.request("PATCH", { ...base, date: "2026-11-03", color: null }, "/" + id)).status).toBe(200);
    expect(f.rows()[1].color).toBeNull();
  });
  test("status preview and completion catch-up only include ended scheduled lessons in the same enrollment", async () => {
    const f = fixture();
    await f.create({ date: "2020-01-01" }); const earlierId = f.rows()[0].id;
    await f.create({ date: "2020-01-02" }); const cancelledId = f.rows()[1].id;
    await f.request("PATCH", { status: "cancelled" }, "/" + cancelledId);
    await f.create({ date: "2020-01-01", startTime: "14:00", endTime: "15:00", enrollmentId: otherEnrollmentId }); const unrelatedId = f.rows()[2].id;
    await f.create({ date: "2099-01-01" }); const futureId = f.rows()[3].id;
    await f.create({ date: "2099-01-02" }); const currentId = f.rows()[4].id;
    const preview = await f.request("GET", undefined, `/${currentId}/status-options`);
    expect(preview.status).toBe(200);
    expect((await preview.json()).earlier.map((row: any) => row.id)).toEqual([earlierId]);
    expect((await f.request("PATCH", { status: "completed", includeEarlier: true }, "/" + currentId)).status).toBe(200);
    expect(f.rows().find(row => row.id === earlierId).status).toBe("completed");
    expect(f.rows().find(row => row.id === cancelledId).status).toBe("cancelled");
    expect(f.rows().find(row => row.id === unrelatedId).status).toBe("scheduled");
    expect(f.rows().find(row => row.id === futureId).status).toBe("scheduled");
  });
  test("skipping earlier completion preserves earlier scheduled lessons", async () => {
    const f = fixture(); await f.create({ date: "2020-01-01" }); await f.create({ date: "2020-01-02" });
    expect((await f.request("PATCH", { status: "completed", scope: "one", includeEarlier: false }, "/" + f.rows()[1].id)).status).toBe(200);
    expect(f.rows().map(row => row.status)).toEqual(["scheduled", "completed"]);
  });
  test("all-series cancellation and completion cover earlier and future occurrences, excluding terminal records", async () => {
    for (const status of ["cancelled", "completed"]) {
      const f = fixture(); await f.create({ date: "2020-01-01", repeat: { frequency: "daily", interval: 1, until: "2020-01-04" } });
      await f.request("PATCH", { status: "completed" }, "/" + f.rows()[0].id);
      const id = f.rows()[2].id;
      expect((await (await f.request("GET", undefined, `/${id}/status-options`)).json()).seriesCount).toBe(3);
      expect((await f.request("PATCH", { status, scope: "all" }, "/" + id)).status).toBe(200);
      expect(f.rows().map(row => row.status)).toEqual(["completed", status, status, status]);
    }
  });
  test("catch-up cannot cross teacher access boundaries and cancellation cannot include catch-up", async () => {
    const f = fixture("teacher");
    const row = { id: crypto.randomUUID(), ...dates({ ...base, date: "2020-01-02" }), status: "scheduled", teacherId, enrollmentId, enrollment: { studentId, teacherId } };
    const earlier = { ...row, ...dates({ ...base, date: "2020-01-01" }), id: crypto.randomUUID(), teacherId: alternateTeacherId };
    f.rows().push(row, earlier);
    expect((await (await f.request("GET", undefined, `/${row.id}/status-options`)).json()).earlier).toHaveLength(0);
    expect((await f.request("PATCH", { status: "cancelled", includeEarlier: true }, "/" + row.id)).status).toBe(422);
    expect((await f.request("PATCH", { status: "completed", includeEarlier: true }, "/" + row.id)).status).toBe(200);
    expect(earlier.status).toBe("scheduled");
  });
  test("selected teacher is persisted, validated and checked for conflicts independently of enrollment", async () => {
    const f = fixture();
    expect((await f.create({ teacherId: alternateTeacherId })).status).toBe(201);
    expect(f.rows()[0].teacherId).toBe(alternateTeacherId);
    expect((await f.create({ enrollmentId: otherEnrollmentId, teacherId: alternateTeacherId })).status).toBe(409);
    expect((await f.create({ enrollmentId: otherEnrollmentId, teacherId })).status).toBe(201);
    expect((await f.request("PATCH", { ...base, startTime: "10:15", endTime: "11:15" }, "/" + f.rows()[0].id)).status).toBe(200);
    expect((await f.request("PATCH", { ...base, teacherId }, "/" + f.rows()[0].id)).status).toBe(409);
    expect((await f.create({ teacherId: "88888888-8888-4888-8888-888888888888" })).status).toBe(422);
  });
  test("future teacher assignment updates only selected occurrences and reminder recipient", async () => {
    const f = fixture(); await f.create({ reminderMinutes: 0, repeat: { frequency: "daily", interval: 1, until: "2026-11-04" } });
    expect((await f.request("PATCH", { ...base, date: "2026-11-03", teacherId: alternateTeacherId, scope: "future" }, "/" + f.rows()[1].id)).status).toBe(200);
    expect(f.rows().map(row => row.teacherId)).toEqual([teacherId, alternateTeacherId, alternateTeacherId]);
    await deliverLessonReminders(f.db, new Date("2026-11-03T06:00:00Z"));
    expect(f.notifications().map(n => n.userId)).toEqual([studentId, alternateTeacherId]);
  });
  test("teachers see and edit only lessons assigned to them and cannot reassign", async () => {
    const f = fixture("teacher", alternateTeacherId);
    // Seed persisted records as an administrator would, without using the teacher's create endpoint.
    const own = { id: crypto.randomUUID(), ...dates(base), status: "scheduled", teacherId: alternateTeacherId, enrollment: { teacherId, studentId }, reminderMinutes: null };
    f.rows().push(own, { ...own, id: crypto.randomUUID(), teacherId });
    expect((await (await f.request("GET")).json()).map((l: any) => l.id)).toEqual([own.id]);
    expect((await f.request("PATCH", { ...base, startTime: "12:00", endTime: "13:00" }, "/" + own.id)).status).toBe(200);
    expect((await f.request("PATCH", { ...base, teacherId }, "/" + own.id)).status).toBe(403);
    expect((await f.request("PATCH", { ...base }, "/" + f.rows()[1].id)).status).toBe(404);
  });
  test("overnight conflict is rejected, touching endpoints are allowed", async () => {
    const f = fixture();
    expect((await f.create({ startTime: "23:00", endTime: "01:00", endDate: "2026-11-03" })).status).toBe(201);
    expect((await f.create({ date: "2026-11-03", startTime: "00:30", endTime: "01:30" })).status).toBe(409);
    expect((await f.create({ date: "2026-11-03", startTime: "01:00", endTime: "02:00" })).status).toBe(201);
    const result = await f.request("GET", undefined, "?from=2026-11-03&to=2026-11-03");
    expect((await result.json()).length).toBe(2);
  });
  test("all-day bookings block the full inclusive date range", async () => {
    const f = fixture();
    expect((await f.create({ allDay: true, endDate: "2026-11-03" })).status).toBe(201);
    expect((await f.create({ date: "2026-11-03", startTime: "23:00", endTime: "23:59" })).status).toBe(409);
    expect((await f.create({ date: "2026-11-04", startTime: "00:00", endTime: "01:00" })).status).toBe(201);
    expect((await (await f.request("GET", undefined, "?from=2026-11-04&to=2026-11-04")).json()).length).toBe(1);
  });
  test("one conflict rolls back all newly created recurring occurrences", async () => {
    const f = fixture(); await f.create({ date: "2026-11-04" });
    expect((await f.create({ repeat: { frequency: "daily", interval: 1, until: "2026-11-06" } })).status).toBe(409);
    expect(f.rows()).toHaveLength(1);
  });
  test("recurring lessons cannot overlap their own duration", async () => {
    const f = fixture();
    expect((await f.create({ endDate: "2026-11-03", endTime: "12:00", repeat: { frequency: "daily", interval: 1, until: "2026-11-04" } })).status).toBe(409);
    expect(f.rows()).toHaveLength(0);
  });
  test("editing future occurrences preserves earlier lessons and permits cancellation of the new series", async () => {
    const f = fixture(); await f.create({ repeat: { frequency: "daily", interval: 1, until: "2026-11-04" } });
    const id = f.rows()[1].id;
    expect((await f.request("PATCH", { ...base, date: "2026-11-03", startTime: "12:00", endTime: "13:00", scope: "future" }, "/" + id)).status).toBe(200);
    expect(f.rows().map(row => serialize(row).startTime)).toEqual(["10:00", "12:00", "12:00"]);
    expect((await f.request("PATCH", { status: "cancelled", scope: "future" }, "/" + id)).status).toBe(200);
    expect(f.rows().map(row => row.status)).toEqual(["scheduled", "cancelled", "cancelled"]);
  });
  test("future reschedule conflict leaves all original occurrences intact", async () => {
    const f = fixture(); await f.create({ repeat: { frequency: "daily", interval: 1, until: "2026-11-04" } });
    await f.create({ date: "2026-11-04", startTime: "12:00", endTime: "13:00" });
    expect((await f.request("PATCH", { ...base, startTime: "12:00", endTime: "13:00", scope: "future" }, "/" + f.rows()[0].id)).status).toBe(409);
    expect(f.rows().slice(0, 3).map(row => serialize(row).startTime)).toEqual(["10:00", "10:00", "10:00"]);
  });
  test("invalid recurrence and reversed multi-day range fail validation", async () => {
    const f = fixture();
    for (const data of [{ endDate: "2026-11-01" }, { repeat: { frequency: "daily", interval: 0, until: "2026-11-10" } }, { repeat: { frequency: "weekly", interval: 1, weekdays: [], until: "2026-11-10" } }, { repeat: { frequency: "daily", interval: 1, until: addDays(base.date, 367) } }]) expect((await f.create(data)).status).toBe(422);
  });
});
describe("lesson reminder delivery", () => {
  test("Baku civil time converts to UTC and reminders deliver once to student and teacher", async () => {
    const f = fixture(); await f.create({ reminderMinutes: 15 });
    expect(f.rows()[0].reminderAt.toISOString()).toBe("2026-11-02T05:45:00.000Z");
    expect(await deliverLessonReminders(f.db, new Date("2026-11-02T05:44:59Z"))).toBe(0);
    expect(await deliverLessonReminders(f.db, new Date("2026-11-02T05:45:00Z"))).toBe(2);
    expect(await deliverLessonReminders(f.db, new Date("2026-11-02T05:46:00Z"))).toBe(0);
    expect(f.notifications().map(n => n.userId)).toEqual([studentId, teacherId]);
  });
  test("cancelled and already-ended lessons do not send stale reminders", async () => {
    const f = fixture(); await f.create({ reminderMinutes: 0 });
    await f.request("PATCH", { status: "cancelled" }, "/" + f.rows()[0].id);
    expect(await deliverLessonReminders(f.db, new Date("2026-11-02T06:00:00Z"))).toBe(0);
    await f.create({ reminderMinutes: 0 });
    expect(await deliverLessonReminders(f.db, new Date("2026-11-02T08:00:00Z"))).toBe(0);
    expect(f.notifications()).toHaveLength(0);
  });
});
