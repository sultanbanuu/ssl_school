import { expect, test } from "bun:test";
import { createApp } from "../src/app";
import { assessmentSchema, defaultWeights, emptyAssessment, scores, weightsSchema } from "../src/shared/performance";
import type { PrismaClient } from "../src/generated/prisma/client";
import type { Role } from "../src/generated/prisma/enums";
const id = "11111111-1111-4111-8111-111111111111", studentId = "22222222-2222-4222-8222-222222222222", teacherId = "33333333-3333-4333-8333-333333333333";
function setup(role: Role | null, assigned = true) {
  const calls: { name: string; args: any }[] = [];
  const capture = (name: string, result: any) => async (args: any) => { calls.push({ name, args }); return result; };
  const db = {
    profile: { findUnique: async () => ({ id, role, student: { id: studentId }, teacher: { id: teacherId } }) },
    enrollment: { findMany: capture("roster", []), findFirst: capture("enrolled", assigned ? { id } : null) },
    teacher: { findUnique: capture("teacher", { performanceWeights: null }), update: capture("weights", {}) },
    student: { update: capture("level", {}) },
    lesson: { findMany: capture("lessons", []), findFirst: capture("lesson", assigned ? { enrollment: { studentId } } : null) },
    lessonEvaluation: { findMany: capture("evaluations", []), findUnique: capture("existing", null), upsert: capture("save", { id }) },
  };
  const app = createApp({ db: db as unknown as PrismaClient, origins: [], getSession: async () => role ? { user: { id } } : null, authHandler: async () => new Response() }).compile();
  const send = (path: string, body?: unknown) => app.handle(new Request(`http://localhost/api/performance${path}`, { method: body ? "PUT" : "GET", ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) }));
  return { send, calls };
}
test("weighted rubric computes reference score and preserves missing versus zero", () => {
  const a = emptyAssessment();
  expect(scores(a).overall).toBeNull();
  a.speaking = [4,4,4,4]; a.vocabulary.earned = 14; a.listening.earned = 9; a.sentenceStructure.earned = 15;
  expect(scores(a).overall).toBe(79);
  a.speaking = [0,0,0,0];
  expect(scores(a).categories.speaking).toBe(0);
  a.listening.earned = null;
  expect(scores(a).overall).toBeNull();
  a.weights = { speaking: 50, vocabulary: 25, listening: 0, sentenceStructure: 25 };
  expect(scores(a).overall).not.toBeNull();
});
test("invalid weights and impossible scores are rejected", () => {
  expect(weightsSchema.safeParse({ ...defaultWeights, speaking: 36 }).success).toBe(false);
  expect(weightsSchema.safeParse({ ...defaultWeights, speaking: -1, listening: 56 }).success).toBe(false);
  for (const earned of [-1, 21, Infinity]) expect(assessmentSchema.safeParse({ ...emptyAssessment(), vocabulary: { earned, possible: 20 } }).success).toBe(false);
  expect(assessmentSchema.safeParse({ ...emptyAssessment(), listening: { earned: 0, possible: 0 } }).success).toBe(false);
});
test("performance requires authentication", async () => {
  const { send, calls } = setup(null);
  expect((await send("")).status).toBe(401); expect(calls).toHaveLength(0);
});
test("student reads only own assessments and never receives internal level in roster", async () => {
  const { send, calls } = setup("student");
  expect((await send("")).status).toBe(200);
  expect(calls.find(c => c.name === "roster")!.args.where).toEqual({ studentId });
  expect(calls.find(c => c.name === "roster")!.args.select.student.select.performanceLevel).toBe(false);
  expect(calls.find(c => c.name === "evaluations")!.args.where).toEqual({ studentId });
});
test("teacher reads only own students and evaluations", async () => {
  const { send, calls } = setup("teacher");
  const response = await send(""); expect(response.status).toBe(200);
  expect((await response.json()).weights).toEqual(defaultWeights);
  expect(calls.find(c => c.name === "roster")!.args.where).toEqual({ teacherId });
  expect(calls.find(c => c.name === "evaluations")!.args.where).toEqual({ teacherId });
});
test("only teachers can change weights or evaluate lessons", async () => {
  for (const role of ["student", "admin", "manager"] as const) {
    const { send, calls } = setup(role);
    expect((await send("/weights", defaultWeights)).status).toBe(403);
    expect((await send(`/lessons/${id}`, { topic: "Lesson", assessment: emptyAssessment() })).status).toBe(403);
    expect(calls).toHaveLength(0);
  }
  const { send, calls } = setup("teacher");
  expect((await send("/weights", defaultWeights)).status).toBe(200);
  expect(calls[0].args.where).toEqual({ id: teacherId });
});
test("evaluation verifies lesson ownership and saves a weight snapshot", async () => {
  const blocked = setup("teacher", false);
  expect((await blocked.send(`/lessons/${id}`, { topic: "Lesson", assessment: emptyAssessment() })).status).toBe(404);
  expect(blocked.calls.some(c => c.name === "save")).toBe(false);
  const { send, calls } = setup("teacher");
  expect((await send(`/lessons/${id}`, { topic: "Lesson", assessment: emptyAssessment() })).status).toBe(200);
  expect(calls.find(c => c.name === "lesson")!.args.where.teacherId).toBe(teacherId);
  expect(calls.find(c => c.name === "save")!.args.create.assessment.weights).toEqual(defaultWeights);
  expect(calls.find(c => c.name === "save")!.args.create.studentId).toBe(studentId);
});
test("only staff assign enrolled student levels", async () => {
  for (const role of ["student", "teacher"] as const) expect((await setup(role).send(`/students/${studentId}/level`, { level: "B1" })).status).toBe(403);
  expect((await setup("admin", false).send(`/students/${studentId}/level`, { level: "B1" })).status).toBe(404);
  expect((await setup("admin").send(`/students/${studentId}/level`, { level: "B1" })).status).toBe(200);
  expect((await setup("admin").send(`/students/${studentId}/level`, { level: "bad" })).status).toBe(422);
});
