import { hasCourseTeacher } from "../../shared/course-teachers";
import type { z } from "zod";
import type { PrismaClient } from "../../generated/prisma/client";
import { HttpError, enrollmentScope, requireStaff, type Actor } from "../../shared/authorization";
import type {
  createEnrollmentBody,
  listQuery,
  updateEnrollmentBody,
} from "./schemas";

function requireEnrollmentEditor(actor: Actor) {
  if (actor.role === "teacher") {
    if (!actor.teacherId)
      throw new HttpError(403, "Teacher account is incomplete");
  } else requireStaff(actor);
}

export function createEnrollmentService(db: PrismaClient) {
  return {
    async list(
      actor: Actor,
      query: z.output<typeof listQuery>,
    ) {
      return db.enrollment.findMany({
        where: enrollmentScope(actor),
        include: {
          course: { select: { name: true } },
          student: {
            select: {
              profile: { select: { firstName: true, lastName: true } },
            },
          },
        },
        take: query.limit,
        skip: query.offset,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      });
    },

    async create(
      actor: Actor,
      body: z.output<typeof createEnrollmentBody>,
    ) {
      requireEnrollmentEditor(actor);
      const result = await db.$transaction(async (tx) => {
        const course = await tx.course.findUnique({
          where: { id: body.courseId },
          include: { teachers: true },
        });
        if (actor.role === "teacher" && !hasCourseTeacher(course, actor.teacherId!))
          throw new HttpError(404, "Course not found");
        if (!course?.active)
          throw new HttpError(422, "Select an active course");
        if (course.perLesson && body.lessonCount === undefined)
          throw new HttpError(422, "Enter the number of lessons for this course");
        if (!course.perLesson && body.lessonCount !== undefined)
          throw new HttpError(422, "This course is paid monthly; lesson count does not apply");
        const student = await tx.student.findUnique({
          where: { id: body.studentId },
        });
        if (!student || student.status !== "active")
          throw new HttpError(422, "Select an active student");
        return tx.enrollment.create({
          data: { ...body, teacherId: course.teacherId },
        });
      });
      return result;
    },

    // Changes the lesson package size of a per-lesson enrollment. Payments already
    // submitted keep the amount quoted at upload time.
    async update(
      actor: Actor,
      id: string,
      body: z.output<typeof updateEnrollmentBody>,
    ) {
      requireEnrollmentEditor(actor);
      return db.$transaction(async (tx) => {
        const enrollment = await tx.enrollment.findUnique({
          where: { id },
          include: { course: { include: { teachers: true } } },
        });
        if (!enrollment || (actor.role === "teacher" && !hasCourseTeacher(enrollment.course, actor.teacherId!)))
          throw new HttpError(404, "Enrollment not found");
        if (!enrollment.course.perLesson)
          throw new HttpError(422, "This course is paid monthly; lesson count does not apply");
        return tx.enrollment.update({
          where: { id },
          data: { lessonCount: body.lessonCount },
        });
      });
    },
  };
}
