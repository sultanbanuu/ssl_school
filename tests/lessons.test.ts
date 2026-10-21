import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import type { PrismaClient } from "../src/generated/prisma/client";
import type { Role } from "../src/generated/prisma/enums";
const userId = "11111111-1111-4111-8111-111111111111";
const studentId = "22222222-2222-4222-8222-222222222222";
const teacherId = "33333333-3333-4333-8333-333333333333";
const enrollmentId = "44444444-4444-4444-8444-444444444444";
const id = "55555555-5555-4555-8555-555555555555";
const body = { enrollmentId, date: "2026-11-02", startTime: "10:00", endTime: "11:00" };
function fixture(role: Role | null = "admin", options: { conflict?: boolean; status?: string; missing?: boolean; complete?: boolean; active?: boolean } = {}) {
  const calls: { name: string; args?: any }[] = [];
  const enrollment = { id: enrollmentId, studentId, teacherId, student: { status: options.active === false ? "inactive" : "active" }, course: { active: true } };
  const lesson = { id, enrollmentId, teacherId, enrollment, date: new Date("2026-11-02T00:00:00Z"), startTime: new Date("1970-01-01T10:00:00Z"), endTime: new Date("1970-01-01T11:00:00Z"), status: options.status ?? "scheduled" };
  const tx = {
    $executeRaw: async () => { calls.push({ name: "lock" }); return 0; },
    enrollment: { findUnique: async () => options.missing ? null : enrollment },
    lesson: {
      findMany: async (args: any) => { calls.push({ name: "list", args }); return [lesson]; },
      findFirst: async (args: any) => { calls.push({ name: "find", args }); return args.where.id === id ? (options.missing ? null : lesson) : options.conflict ? lesson : null; },
      create: async (args: any) => { calls.push({ name: "create", args }); return { ...lesson, ...args.data }; },
      update: async (args: any) => { calls.push({ name: "update", args }); return { ...lesson, ...args.data }; },
    },
  };
  const db = { ...tx, profile: { findUnique: async () => ({ id: userId, role, student: options.complete === false ? null : { id: studentId }, teacher: options.complete === false ? null : { id: teacherId } }) }, $transaction: async (fn: any, options: any) => { calls.push({ name: "transaction", args: options }); return fn(tx); } } as unknown as PrismaClient;
  const app = createApp({ db, getSession: async () => role ? { user: { id: userId } } : null, authHandler: async () => new Response(), origins: [] }).compile();
  const request = (method = "GET", data?: unknown, path = "/api/lessons") => app.handle(new Request(`http://localhost${path}`, { method, ...(data ? { headers: { "content-type": "application/json" }, body: JSON.stringify(data) } : {}) }));
  return { calls, request };
}
describe("lesson access", () => {
  test("anonymous and incomplete accounts fail closed", async () => {
    for (const [role, complete, status] of [[null, true, 401], ["student", false, 403], ["teacher", false, 403]] as const) {
      const f = fixture(role, { complete }); expect((await f.request()).status).toBe(status); expect(f.calls).toHaveLength(0);
    }
  });
  test("student and teacher schedules are scoped and times serialize without UTC shifting", async () => {
    for (const role of ["student", "teacher"] as const) {
      const f = fixture(role); const response = await f.request(); expect(response.status).toBe(200);
      expect(f.calls[0].args.where).toEqual({ enrollment: role === "student" ? { studentId } : { teacherId } });
      expect((await response.json())[0]).toMatchObject({ date: body.date, startTime: "10:00", endTime: "11:00" });
    }
  });
  test("students and teachers cannot create lessons; students cannot modify lessons", async () => {
    for (const role of ["student", "teacher"] as const) expect((await fixture(role).request("POST", body)).status).toBe(403);
    expect((await fixture("student").request("PATCH", { status: "completed" }, `/api/lessons/${id}`)).status).toBe(403);
  });
  test("teacher updates require assigned ownership and missing lessons return 404", async () => {
    const f = fixture("teacher", { missing: true }); expect((await f.request("PATCH", { status: "cancelled" }, `/api/lessons/${id}`)).status).toBe(404);
    expect(f.calls.find(c => c.name === "find")?.args.where).toEqual({ id, enrollment: { teacherId } });
  });
  test("filters are validated", async () => {
    const f = fixture();
    for (const query of ["limit=101", "from=2026-02-30", "from=2026-12-01&to=2026-11-01", "status=other"]) expect((await f.request("GET", undefined, `/api/lessons?${query}`)).status).toBe(422);
  });
});
describe("lesson mutations", () => {
  test("staff create lessons with the enrollment teacher and lock before checking conflicts", async () => {
    for (const role of ["admin", "manager"] as const) {
      const f = fixture(role); expect((await f.request("POST", body)).status).toBe(201);
      expect(f.calls.map(c => c.name)).toEqual(["transaction", "lock", "find", "create"]);
      expect(f.calls[0].args).toEqual({ isolationLevel: "ReadCommitted" });
      expect(f.calls[3].args.data.teacherId).toBe(teacherId);
      expect(f.calls[2].args.where).toMatchObject({ status: { not: "cancelled" }, OR: [{ teacherId }, { enrollment: { studentId } }], startTime: { lt: new Date("1970-01-01T11:00:00Z") }, AND: [{ OR: [{ endTime: { gt: new Date("1970-01-01T10:00:00Z") } }, { endTime: null }] }] });
    }
  });
  test("conflicting creates and reschedules return 409 without writes", async () => {
    for (const [method, data, path] of [["POST", body, "/api/lessons"], ["PATCH", { date: body.date, startTime: "10:30", endTime: "11:30" }, `/api/lessons/${id}`]] as const) {
      const f = fixture("admin", { conflict: true }); expect((await f.request(method, data, path)).status).toBe(409);
      expect(f.calls.some(c => c.name === "create" || c.name === "update")).toBe(false);
    }
  });
  test("reschedules exclude themselves from the conflict query", async () => {
    const f = fixture("teacher"); expect((await f.request("PATCH", { date: body.date, startTime: "11:00", endTime: "12:00" }, `/api/lessons/${id}`)).status).toBe(200);
    expect(f.calls.filter(c => c.name === "find")[1].args.where.id).toEqual({ not: id });
  });
  test("cancel and complete scheduled lessons", async () => {
    for (const status of ["cancelled", "completed"]) {
      const f = fixture("teacher"); const response = await f.request("PATCH", { status }, `/api/lessons/${id}`);
      expect(response.status).toBe(200); expect((await response.json()).status).toBe(status);
    }
  });
  test("terminal lessons cannot be modified", async () => {
    for (const status of ["completed", "cancelled"]) expect((await fixture("admin", { status }).request("PATCH", { status: "completed" }, `/api/lessons/${id}`)).status).toBe(409);
  });
  test("missing or inactive enrollments are rejected", async () => {
    for (const options of [{ missing: true }, { active: false }]) expect((await fixture("admin", options).request("POST", body)).status).toBe(422);
  });
  test("reject invalid dates, missing ends, reversed ranges, overrides, and mixed mutations", async () => {
    for (const data of [{ ...body, date: "2026-02-30" }, { ...body, endTime: undefined }, { ...body, endTime: "09:00" }, { ...body, endTime: "10:00" }, { ...body, teacherId }]) expect((await fixture().request("POST", data)).status).toBe(422);
    expect((await fixture().request("PATCH", { date: body.date, startTime: "10:00", endTime: "11:00", status: "completed" }, `/api/lessons/${id}`)).status).toBe(422);
  });
});
