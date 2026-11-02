import type { z } from "zod";
import type { PrismaClient } from "../../generated/prisma/client";
import { HttpError, enrollmentScope, requireStaff, type Actor } from "../../shared/authorization";
import type {
  createEnrollmentBody,
  listQuery,
} from "./schemas";

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
      if (actor.role === "teacher") {
        if (!actor.teacherId)
          throw new HttpError(403, "Teacher account is incomplete");
      } else requireStaff(actor);
      const result = await db.$transaction(async (tx) => {
        const course = await tx.course.findUnique({
          where: { id: body.courseId },
        });
        if (actor.role === "teacher" && course?.teacherId !== actor.teacherId)
          throw new HttpError(404, "Course not found");
        if (!course?.active)
          throw new HttpError(422, "Select an active course");
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
    }
  };
}
