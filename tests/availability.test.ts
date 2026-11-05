import { expect, test } from "bun:test";
import { createApp } from "../src/app";
import { dates } from "../src/modules/lessons/service";
import { workingMinutes } from "../src/teacher-hours";

const teacher = "11111111-1111-4111-8111-111111111111", student = "22222222-2222-4222-8222-222222222222", course = "33333333-3333-4333-8333-333333333333", other = "44444444-4444-4444-8444-444444444444";
const input = { teacherId: teacher, courseId: course, date: "2099-01-05", startTime: "16:00", endTime: "16:15" };
function matches(row: any, where: any): boolean {
  return Object.entries(where || {}).every(([key, value]: [string, any]) => {
    if (key === "OR") return value.some((w: any) => matches(row, w));
    if (key === "AND") return value.every((w: any) => matches(row, w));
    const actual = row?.[key];
    if (value === null) return actual == null;
    if (typeof value !== "object" || value instanceof Date) return actual === value || (actual instanceof Date && +actual === +value);
    if ("in" in value) return value.in.includes(actual);
    if ("notIn" in value) return !value.notIn.includes(actual);
    if ("not" in value) return actual !== value.not;
    if ("equals" in value) return value.mode === "insensitive" ? String(actual).toLowerCase() === String(value.equals).toLowerCase() : actual === value.equals;
    if ("none" in value) return !actual.some((r: any) => matches(r, value.none));
    if (["lt", "lte", "gt", "gte"].some(k => k in value)) return actual != null && (!("lt" in value) || actual < value.lt) && (!("lte" in value) || actual <= value.lte) && (!("gt" in value) || actual > value.gt) && (!("gte" in value) || actual >= value.gte);
    return matches(actual, value);
  });
}
function fixture() {
  let role = "admin", who = student, teacherId = teacher;
  let slots: any[] = [], requests: any[] = [], lessons: any[] = [], lockCount = 0;
  const decorateSlot = (s: any) => ({ ...s, course: { id: s.courseId, name: "English", active: true }, teacher: { id: s.teacherId, profile: { firstName: s.teacherName || "Sayad", lastName: "Test" } }, requests: requests.filter(r => r.slotId === s.id && ["pending", "approved"].includes(r.status)).map(r => ({ ...r, student: { profile: { firstName: "Student", lastName: "Test" } } })) });
  const decorateRequest = (r: any) => ({ ...r, slot: decorateSlot(slots.find(s => s.id === r.slotId)), student: { profile: { firstName: "Student", lastName: "Test" } } });
  const many = (rows: any[], args: any) => rows.filter(row => matches(row, args.where)).slice(args.skip || 0, (args.skip || 0) + (args.take ?? rows.length));
  const db: any = {
    teacher: { findMany: async () => [] },
    profile: { findUnique: async () => ({ id: who, role, teacher: teacherId ? { id: teacherId } : null, student: { id: who } }) },
    course: { findUnique: async ({ where }: any) => ({ id: where.id, teacherId: where.id === course ? teacher : other, active: true }) },
    student: { findUnique: async ({ where }: any) => ({ id: where.id, status: "active" }) },
    $queryRaw: async () => [],
    $executeRaw: async () => { lockCount++; return 0; },
    lesson: { findMany: async (args: any) => many(lessons, args) },
    availabilitySlot: {
      findMany: async (args: any) => many(slots.map(decorateSlot), args),
      findFirst: async ({ where }: any) => slots.map(decorateSlot).find(row => matches(row, where)) || null,
      create: async ({ data }: any) => { const row = { id: crypto.randomUUID(), active: true, ...data }; slots.push(row); return decorateSlot(row); },
      update: async ({ where, data }: any) => { const row = slots.find(r => r.id === where.id); Object.assign(row, data); return decorateSlot(row); },
    },
    trialRequest: {
      updateMany: async ({ where, data }: any) => { const rows = requests.filter(r => matches(r, where)); rows.forEach(r => Object.assign(r, data)); return { count: rows.length }; },
      findMany: async (args: any) => many(requests.map(decorateRequest), args),
      findFirst: async ({ where }: any) => requests.map(decorateRequest).find(row => matches(row, where)) || null,
      upsert: async ({ where, create, update }: any) => { let row = requests.find(r => matches(r, where.slotId_studentId)); if (row) Object.assign(row, update); else { row = { id: crypto.randomUUID(), status: "pending", createdAt: new Date(), ...create }; requests.push(row); } return decorateRequest(row); },
      update: async ({ where, data }: any) => { const row = requests.find(r => r.id === where.id); Object.assign(row, data); return decorateRequest(row); },
    },
    $transaction: async (fn: any) => { const saved = structuredClone({ slots, requests }); try { return await fn(db); } catch (e) { slots = saved.slots; requests = saved.requests; throw e; } },
  };
  const app = createApp({ db, getSession: async () => role === "anonymous" ? null : { user: { id: who } }, authHandler: async () => new Response(), origins: [] }).compile();
  const send = (path: string, method = "GET", body?: unknown) => app.handle(new Request("http://localhost/api" + path, { method, headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }));
  return { send, act: (r: string, id = student, t = teacher) => { role = r; who = id; teacherId = t; }, slots: () => slots, requests: () => requests, lessons, db, locks: () => lockCount };
}
test("new students request trials without enrollments; approvals, ownership and cancellation are enforced", async () => {
  const f = fixture(); const created = await f.send("/availability", "POST", input); expect(created.status).toBe(201);
  const slot = await created.json();
  f.act("student");
  const list = await (await f.send("/availability?from=2099-01-01&to=2099-01-07")).json();
  expect(list.items).toHaveLength(1); expect(list.items[0].requests).toBeUndefined(); expect(list.items[0].reservation).toBeUndefined();
  const sent = await f.send("/trial-requests", "POST", { slotId: slot.id }); expect(sent.status).toBe(201); const trial = await sent.json();
  expect(trial.status).toBe("pending");
  expect((await f.send(`/trial-requests/${trial.id}`, "PATCH", { status: "approved" })).status).toBe(403);
  f.act("student", other);
  expect((await f.send("/trial-requests", "POST", { slotId: slot.id })).status).toBe(409);
  expect(await (await f.send("/trial-requests")).json()).toEqual([]);
  expect((await f.send(`/trial-requests/${trial.id}`, "PATCH", { status: "cancelled" })).status).toBe(404);
  f.act("teacher", other, other);
  expect((await f.send(`/trial-requests/${trial.id}`, "PATCH", { status: "approved" })).status).toBe(404);
  f.act("teacher");
  expect((await f.send(`/availability/${slot.id}`, "PATCH", { ...input, startTime: "17:00", endTime: "17:15" })).status).toBe(200);
  expect((await f.send(`/trial-requests/${trial.id}`, "PATCH", { status: "approved" })).status).toBe(200);
  f.act("student");
  expect((await f.send(`/trial-requests/${trial.id}`, "PATCH", { status: "cancelled" })).status).toBe(200);
  expect((await (await f.send("/availability?from=2099-01-01&to=2099-01-07")).json()).items).toHaveLength(1);
  expect(f.locks()).toBeGreaterThan(5);
  f.act("teacher");
  expect((await f.send(`/availability/${slot.id}`, "PATCH", { ...input, startTime: "17:00", endTime: "17:15" })).status).toBe(200);
  expect((await f.send(`/availability/${slot.id}`, "PATCH", { active: false })).status).toBe(200);
});

test("student trials exclude teachers other than Sayad", async () => {
  const f = fixture();
  const slot = await (await f.send("/availability", "POST", input)).json();
  f.slots()[0].teacherName = "Another teacher";
  f.act("student");
  const list = await (await f.send("/availability?from=2099-01-01&to=2099-01-07")).json();
  expect(list.items).toHaveLength(0);
  expect((await f.send("/trial-requests", "POST", { slotId: slot.id })).status).toBe(409);
});

test("student trial reservations cannot overlap across teachers but adjacent trials are allowed", async () => {
  const f = fixture();
  const first = await (await f.send("/availability", "POST", input)).json();
  const second = await (await f.send("/availability", "POST", { ...input, teacherId: other, courseId: other })).json();
  const adjacent = await (await f.send("/availability", "POST", { ...input, teacherId: other, courseId: other, startTime: "16:15", endTime: "16:30" })).json();
  f.act("student");
  expect((await f.send("/trial-requests", "POST", { slotId: first.id })).status).toBe(201);
  expect((await f.send("/trial-requests", "POST", { slotId: second.id })).status).toBe(409);
  expect((await f.send("/trial-requests", "POST", { slotId: adjacent.id })).status).toBe(201);
});

test("student availability pagination continues when regular conflicts hide an entire page", async () => {
  const f = fixture(); await f.send("/availability", "POST", input);
  await f.send("/availability", "POST", { ...input, date: "2099-01-06" });
  f.lessons.push({ id: "regular", teacherId: teacher, status: "scheduled", enrollment: { studentId: student }, ...dates(input) });
  f.act("student");
  const first = await (await f.send("/availability?from=2099-01-01&to=2099-01-07&limit=1")).json();
  expect(first.items).toHaveLength(0); expect(first.hasMore).toBe(true);
  const second = await (await f.send("/availability?from=2099-01-01&to=2099-01-07&limit=1&offset=1")).json();
  expect(second.items).toHaveLength(1);
});
test("availability management requires ownership and valid future school hours", async () => {
  const f = fixture();
  f.act("student"); expect((await f.send("/availability", "POST", input)).status).toBe(403);
  f.act("anonymous"); expect((await f.send("/availability?from=2099-01-01&to=2099-01-07")).status).toBe(401);
  f.act("teacher", student, ""); expect((await f.send("/availability", "POST", input)).status).toBe(403);
  f.act("teacher", student, other); expect((await f.send("/availability", "POST", input)).status).toBe(403);
  f.act("teacher");
  for (const invalid of [{ startTime: "09:00" }, { endTime: "23:45" }, { endTime: "12:00" }, { startTime: "12:07" }, { endTime: "16:00" }, { date: "2020-01-01" }, { courseId: other }]) expect((await f.send("/availability", "POST", { ...input, ...invalid })).status).toBe(422);
  expect((await f.send("/availability", "POST", input)).status).toBe(201);
  expect((await f.send("/availability", "POST", input)).status).toBe(409);
  const id = f.slots()[0].id;
  f.act("teacher", student, other); expect((await f.send(`/availability/${id}`, "PATCH", { active: false })).status).toBe(404);
  f.act("admin"); expect((await f.send(`/availability/${id}`, "PATCH", { ...input, startTime: "17:00", endTime: "17:15" })).status).toBe(200);
  expect((await f.send(`/availability/${id}`, "PATCH", { active: false })).status).toBe(200);
  f.act("student"); expect((await f.send("/trial-requests", "POST", { slotId: id })).status).toBe(409);
});
test("regular lesson conflicts block publication and requests; approval rechecks conflicts", async () => {
  const f = fixture();
  f.lessons.push({ id: "regular", teacherId: teacher, status: "scheduled", enrollment: { studentId: student }, ...dates({ ...input }) });
  expect((await f.send("/availability", "POST", input)).status).toBe(409);
  f.lessons.length = 0;
  const slot = await (await f.send("/availability", "POST", input)).json();
  f.act("student");
  const trial = await (await f.send("/trial-requests", "POST", { slotId: slot.id })).json();
  f.lessons.push({ id: "regular", teacherId: teacher, status: "scheduled", enrollment: { studentId: student }, ...dates(input) });
  f.act("admin"); expect((await f.send(`/trial-requests/${trial.id}`, "PATCH", { status: "approved" })).status).toBe(409);
  expect(f.requests()[0].status).toBe("pending");
  expect((await f.send(`/trial-requests/${trial.id}`, "PATCH", { status: "declined" })).status).toBe(200);
  f.act("student"); expect((await f.send("/trial-requests", "POST", { slotId: slot.id })).status).toBe(409);
});

test("generated Sayad trials are stable, fifteen minutes, skip Sundays and regular lessons", async () => {
 const f = fixture();
 f.db.teacher.findMany = async () => [{ id: teacher, profile: { firstName: "Sayad", lastName: "Test" }, courses: [{ id: course, name: "English" }] }];
 f.act("student");
 const path = "/availability?from=2099-01-05&to=2099-01-11";
 const first = await (await f.send(path)).json();
 expect(first.items.length).toBe(62);
 expect((await (await f.send(path)).json()).items).toEqual(first.items);
 for (const slot of first.items) {
  expect(new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime()).toBe(900000);
  const civil = new Date(new Date(slot.startsAt).getTime() + 4 * 3600000);
  expect(civil.getUTCDay()).not.toBe(0);
  const minute = civil.getUTCHours() * 60 + civil.getUTCMinutes();
  expect(workingMinutes("Sayad", civil.toISOString().slice(0, 10)).some(([a,b]) => minute >= a && minute + 15 <= b)).toBe(true);
 }
 const slot = first.items[0];
 const conflict = first.items[1];
 const civil = new Date(new Date(conflict.startsAt).getTime() + 4 * 3600000).toISOString();
 f.lessons.push({ id: "blocking", teacherId: teacher, status: "scheduled", enrollment: { studentId: student }, ...dates({ ...input, date: civil.slice(0,10), startTime: civil.slice(11,16), endTime: new Date(new Date(conflict.endsAt).getTime() + 4 * 3600000).toISOString().slice(11,16) }) });
 expect((await (await f.send(path)).json()).items.some((s: any) => s.id === conflict.id)).toBe(false);
 expect((await f.send("/trial-requests", "POST", { slotId: slot.id })).status).toBe(201);
 expect((await f.send("/trial-requests", "POST", { slotId: slot.id })).status).toBe(409);
 f.act("teacher");
 expect((await f.send(`/availability/${f.slots()[0].id}`, "PATCH", { active: false })).status).toBe(200);
 expect(f.requests()[0].status).toBe("cancelled");
});

test("deleting availability enforces ownership and cancels held trials while keeping history", async () => {
  const f = fixture();
  const slot = await (await f.send("/availability", "POST", input)).json();
  f.act("student");
  const trial = await (await f.send("/trial-requests", "POST", { slotId: slot.id })).json();
  for (const role of ["student", "manager"]) {
    f.act(role);
    expect((await f.send(`/availability/${slot.id}`, "DELETE")).status).toBe(403);
  }
  f.act("teacher", other, other);
  expect((await f.send(`/availability/${slot.id}`, "DELETE")).status).toBe(404);
  expect(f.slots()[0].active).toBe(true);
  expect(f.requests()[0].status).toBe("pending");
  f.act("teacher");
  expect((await f.send(`/trial-requests/${trial.id}`, "PATCH", { status: "approved" })).status).toBe(200);
  expect((await f.send(`/availability/${slot.id}`, "DELETE")).status).toBe(200);
  expect(f.slots()[0].active).toBe(false);
  expect(f.requests()[0].status).toBe("cancelled");
  expect(f.requests()).toHaveLength(1);
  f.act("student");
  expect((await f.send("/trial-requests", "POST", { slotId: slot.id })).status).toBe(409);
  f.act("admin");
  const another = await (await f.send("/availability", "POST", { ...input, teacherId: other, courseId: other })).json();
  expect((await f.send(`/availability/${another.id}`, "DELETE")).status).toBe(200);
});

test("deleting generated availability persists across refresh and blocks trial requests", async () => {
  const f = fixture();
  f.db.teacher.findMany = async () => [{ id: teacher, profile: { firstName: "Sayad", lastName: "Test" }, courses: [{ id: course, name: "English" }] }];
  const path = "/availability?from=2099-01-05&to=2099-01-11";
  const slots = (await (await f.send(path)).json()).items;
  f.act("teacher", other, other);
  expect((await f.send(`/availability/${encodeURIComponent(slots[0].id)}`, "DELETE")).status).toBe(404);
  for (const [index, role] of ["teacher", "admin"].entries()) {
    f.act(role);
    expect((await f.send(`/availability/${encodeURIComponent(slots[index].id)}`, "DELETE")).status).toBe(200);
    f.act("student");
    const after = (await (await f.send(path)).json()).items;
    expect(after.some((s: any) => s.id === slots[index].id)).toBe(false);
    expect((await f.send("/trial-requests", "POST", { slotId: slots[index].id })).status).toBe(409);
  }
});
