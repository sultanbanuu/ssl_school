import { Elysia } from "elysia";
import { z } from "zod";
import type { PrismaClient } from "../../generated/prisma/client";
import { enrollmentScope, HttpError, requireStaff, type Actor } from "../../shared/authorization";
import { assessmentSchema, defaultWeights, levels, weightsSchema } from "../../shared/performance";

const idParams = z.object({ id: z.uuid() });
export function performanceRoutes(db: PrismaClient, actorFor: (request: Request) => Promise<Actor>) {
  const teacherId = (actor: Actor) => {
    if (actor.role !== "teacher" || !actor.teacherId) throw new HttpError(403, "Teacher access required");
    return actor.teacherId;
  };
  return new Elysia()
    .get("/api/performance", async ({ request }) => {
      const actor = await actorFor(request);
      const scope = enrollmentScope(actor);
      const enrollments = await db.enrollment.findMany({ where: scope, orderBy: { createdAt: "asc" }, select: {
        id: true, courseId: true, studentId: true,
        course: { select: { name: true } },
        student: { select: { id: true, performanceLevel: actor.role !== "student", profile: { select: { firstName: true, lastName: true } } } },
      } });
      const evaluations = await db.lessonEvaluation.findMany({
        where: actor.role === "student" ? { studentId: actor.studentId! } : actor.role === "teacher" ? { teacherId: actor.teacherId! } : {},
        include: { lesson: { select: { date: true, enrollmentId: true } } }, orderBy: { lesson: { date: "asc" } },
      });
      const teacher = actor.role === "teacher" ? await db.teacher.findUnique({ where: { id: teacherId(actor) }, select: { performanceWeights: true } }) : null;
      return { enrollments, evaluations, weights: teacher?.performanceWeights ?? defaultWeights };
    })
    .put("/api/performance/weights", async ({ request, body }) => {
      const id = teacherId(await actorFor(request));
      await db.teacher.update({ where: { id }, data: { performanceWeights: body } });
      return body;
    }, { body: weightsSchema })
    .put("/api/performance/students/:id/level", async ({ request, params, body }) => {
      requireStaff(await actorFor(request));
      const enrolled = await db.enrollment.findFirst({ where: { studentId: params.id }, select: { id: true } });
      if (!enrolled) throw new HttpError(404, "Enrolled student not found");
      await db.student.update({ where: { id: params.id }, data: { performanceLevel: body.level } });
      return { level: body.level };
    }, { params: idParams, body: z.object({ level: z.enum(levels).nullable() }).strict() })
    .get("/api/performance/students/:id/lessons", async ({ request, params }) => {
      const id = teacherId(await actorFor(request));
      return db.lesson.findMany({ where: { teacherId: id, enrollment: { studentId: params.id, teacherId: id }, status: { in: ["scheduled", "completed"] } }, select: { id: true, date: true, enrollment: { select: { course: { select: { name: true } } } } }, orderBy: { date: "desc" } });
    }, { params: idParams })
    .put("/api/performance/lessons/:id", async ({ request, params, body }) => {
      const id = teacherId(await actorFor(request));
      const lesson = await db.lesson.findFirst({ where: { id: params.id, teacherId: id, enrollment: { teacherId: id }, status: { in: ["scheduled", "completed"] } }, select: { enrollment: { select: { studentId: true } } } });
      if (!lesson) throw new HttpError(404, "Lesson not found");
      // One current evaluation per lesson. Edits retain its weight snapshot unless explicitly changed.
      const existing = await db.lessonEvaluation.findUnique({ where: { lessonId: params.id }, select: { teacherId: true } });
      if (existing && existing.teacherId !== id) throw new HttpError(403, "Only the evaluating teacher can adjust this score");
      return db.lessonEvaluation.upsert({ where: { lessonId: params.id },
        create: { lessonId: params.id, teacherId: id, studentId: lesson.enrollment.studentId, ...body },
        update: body,
      });
    }, { params: idParams, body: z.object({ topic: z.string().trim().min(1).max(200), assessment: assessmentSchema }).strict() });
}
