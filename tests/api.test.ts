import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import type { PrismaClient } from "../src/generated/prisma/client";
import type { Role } from "../src/generated/prisma/enums";

const userId = "11111111-1111-4111-8111-111111111111";
const studentId = "22222222-2222-4222-8222-222222222222";
const teacherId = "33333333-3333-4333-8333-333333333333";
const courseId = "44444444-4444-4444-8444-444444444444";
function fixture(role: Role | null, complete = true) {
  const calls: { name: string; args: any }[] = [];
  const db = {
    profile: { findUnique: async () => ({ id: userId, role, student: complete ? { id: studentId } : null, teacher: complete ? { id: teacherId } : null }) },
    course: { findMany: async (args: any) => { calls.push({ name: "courses", args }); return []; } },
    enrollment: { findMany: async (args: any) => { calls.push({ name: "enrollments", args }); return []; } },
  } as unknown as PrismaClient;
  const app = createApp({ db, getSession: async () => role ? { user: { id: userId } } : null, authHandler: async () => new Response(), origins: ["http://localhost:8081"] }).compile();
  return { app, calls };
}
function request(path: string, body?: unknown) {
  return new Request(`http://localhost${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
}
describe("API authorization and validation", () => {
  test("anonymous requests cannot read enrollments", async () => {
    const { app, calls } = fixture(null);
    expect((await app.handle(request("/api/enrollments"))).status).toBe(401);
    expect(calls).toHaveLength(0);
  });
  test("students query only their student record, not the auth user id", async () => {
    const { app, calls } = fixture("student");
    expect((await app.handle(request("/api/enrollments"))).status).toBe(200);
    expect(calls[0].args.where).toEqual({ studentId });
  });
  test("teachers query only their assigned enrollments", async () => {
    const { app, calls } = fixture("teacher");
    expect((await app.handle(request("/api/enrollments"))).status).toBe(200);
    expect(calls[0].args.where).toEqual({ teacherId });
  });
  test("incomplete student records fail closed", async () => {
    const { app, calls } = fixture("student", false);
    expect((await app.handle(request("/api/enrollments"))).status).toBe(403);
    expect(calls).toHaveLength(0);
  });
  test("students cannot enroll another student", async () => {
    const { app } = fixture("student");
    expect((await app.handle(request("/api/enrollments", { studentId, courseId }))).status).toBe(403);
  });
  test("students cannot create courses", async () => {
    const { app } = fixture("student");
    expect((await app.handle(request("/api/courses", { name: "English", category: "General", price: "20.00", teacherId }))).status).toBe(403);
  });
  test("student course list excludes inactive courses", async () => {
    const { app, calls } = fixture("student");
    await app.handle(request("/api/courses"));
    expect(calls[0].args.where).toEqual({ active: true });
  });
  test("staff cannot supply a teacher override when enrolling", async () => {
    const { app } = fixture("admin");
    expect((await app.handle(request("/api/enrollments", { studentId, courseId, teacherId }))).status).toBe(422);
  });
  test("negative prices and excessive pagination are rejected", async () => {
    const { app } = fixture("admin");
    expect((await app.handle(request("/api/courses", { name: "English", category: "General", price: "-1.00", teacherId }))).status).toBe(422);
    expect((await app.handle(request("/api/courses?limit=100000"))).status).toBe(422);
  });
});
