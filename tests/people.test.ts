import { expect, test } from "bun:test";
import { verifyPassword } from "better-auth/crypto";
import { createApp } from "../src/app";
import { Prisma, type PrismaClient } from "../src/generated/prisma/client";
import type { Role } from "../src/generated/prisma/enums";

const id = "11111111-1111-4111-8111-111111111111";
const studentId = "22222222-2222-4222-8222-222222222222";
const teacherId = "33333333-3333-4333-8333-333333333333";
const account = { email: "NEW@example.test", password: "test-password-123456", firstName: "Test", lastName: "Student" };
function setup(role: Role | null, duplicate = false) {
  const calls: { name: string; args: any }[] = [];
  const capture = (name: string, result: any) => async (args: any) => { calls.push({ name, args }); return result; };
  const db: any = {
    profile: {
      findUnique: async () => ({ id, role, student: { id: studentId }, teacher: { id: teacherId } }),
      create: async (args: any) => { calls.push({ name: "profile.create", args }); return { id: args.data.id, role: args.data.role, student: { id: studentId }, teacher: { id: teacherId } }; },
    },
    user: {
      create: async (args: any) => { calls.push({ name: "user.create", args }); if (duplicate) throw new Prisma.PrismaClientKnownRequestError("Duplicate", { code: "P2002", clientVersion: "7.10.1" }); return {}; },
      update: capture("user.update", {}),
    },
    student: {
      findMany: capture("student.list", []), findFirst: capture("student.get", null),
      update: capture("student.update", { id: studentId, profileId: id, profile: { firstName: "Updated", lastName: "Student" } }),
    },
    teacher: { findMany: capture("teacher.list", []), findFirst: capture("teacher.get", null), update: capture("teacher.update", { id: teacherId, profileId: id, profile: { firstName: "Updated", lastName: "Teacher" } }) },
    $transaction: async (fn: any) => { calls.push({ name: "transaction", args: {} }); return fn(db); },
  };
  const app = createApp({ db: db as PrismaClient, origins: [], getSession: async () => role ? { user: { id } } : null, authHandler: async () => new Response() }).compile();
  const send = (path: string, method = "GET", body?: unknown) => app.handle(new Request(`http://localhost${path}`, {
    method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
  }));
  return { send, calls };
}

test("staff creation hashes credentials and creates a fixed student role atomically", async () => {
  const { send, calls } = setup("admin");
  const response = await send("/api/students", "POST", account);
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ id: studentId, profileId: expect.any(String), role: "student" });
  expect(calls.map((c) => c.name)).toEqual(["transaction", "user.create", "profile.create"]);
  const data = calls[1].args.data;
  expect(data.email).toBe("new@example.test");
  expect(data.accounts.create.accountId).toBe(data.id);
  expect(await verifyPassword({ hash: data.accounts.create.password, password: account.password })).toBe(true);
  expect(calls[2].args.data.role).toBe("student");
  expect(calls[2].args.data.student).toEqual({ create: {} });
});
test("manager can create teacher with specialization", async () => {
  const { send, calls } = setup("manager");
  const response = await send("/api/teachers", "POST", { ...account, specialization: "English" });
  expect(response.status).toBe(201);
  expect((await response.json()).id).toBe(teacherId);
  expect(calls[2].args.data.teacher).toEqual({ create: { specialization: "English" } });
});
test("duplicate email returns 409 and does not proceed to profile creation", async () => {
  const { send, calls } = setup("admin", true);
  expect((await send("/api/students", "POST", account)).status).toBe(409);
  expect(calls.some((c) => c.name === "profile.create")).toBe(false);
});
test("public and nonstaff account creation is denied before writes", async () => {
  for (const role of [null, "student", "teacher"] as const) {
    const { send, calls } = setup(role);
    expect((await send("/api/students", "POST", account)).status).toBe(role ? 403 : 401);
    expect(calls).toHaveLength(0);
  }
});
test("role injection, weak passwords, and missing specializations are rejected", async () => {
  const { send, calls } = setup("admin");
  expect((await send("/api/students", "POST", { ...account, role: "admin" })).status).toBe(422);
  expect((await send("/api/students", "POST", { ...account, password: "short" })).status).toBe(422);
  expect((await send("/api/teachers", "POST", account)).status).toBe(422);
  expect(calls).toHaveLength(0);
});
test("teachers list only assigned students without exposing contact or auth fields", async () => {
  const { send, calls } = setup("teacher");
  expect((await send("/api/students" )).status).toBe(200);
  expect(calls[0].args.where).toEqual({ enrollments: { some: { teacherId } } });
  expect(calls[0].args.include.profile.select.user).toBe(false);
  expect(calls[0].args.include.profile.select.phone).toBe(false);
});
test("students list themselves and cannot browse teachers", async () => {
  const { send, calls } = setup("student");
  expect((await send("/api/students")).status).toBe(200);
  expect(calls[0].args.where).toEqual({ id: studentId });
  expect((await send("/api/teachers")).status).toBe(403);
});
test("detail lookups combine target ID with ownership scope and return 404", async () => {
  const { send, calls } = setup("student");
  expect((await send(`/api/students/${teacherId}`)).status).toBe(404);
  expect(calls[0].args.where).toEqual({ AND: [{ id: teacherId }, { id: studentId }] });
});
test("profile edits synchronize auth display name within the transaction", async () => {
  const { send, calls } = setup("admin");
  expect((await send(`/api/students/${studentId}`, "PATCH", { firstName: "Updated", status: "inactive" })).status).toBe(200);
  expect(calls.map((c) => c.name)).toEqual(["transaction", "student.update", "user.update"]);
  expect(calls[1].args.data.status).toBe("inactive");
  expect(calls[2].args.data.name).toBe("Updated Student");
});
test("updates reject privilege changes and account identifiers", async () => {
  const { send, calls } = setup("manager");
  for (const body of [{ role: "admin" }, { profileId: id }, { password: account.password }, {}]) {
    expect((await send(`/api/students/${studentId}`, "PATCH", body)).status).toBe(422);
  }
  expect(calls).toHaveLength(0);
});
test("students and teachers cannot edit managed records", async () => {
  for (const role of ["student", "teacher"] as const) {
    const { send, calls } = setup(role);
    expect((await send(`/api/students/${studentId}`, "PATCH", { firstName: "Changed" })).status).toBe(403);
    expect((await send(`/api/teachers/${teacherId}`, "PATCH", { specialization: "Changed" })).status).toBe(403);
    expect(calls).toHaveLength(0);
  }
});
