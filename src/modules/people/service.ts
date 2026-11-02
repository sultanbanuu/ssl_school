import type { z } from "zod";
import { provisionAccount } from "../../accounts";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import {
  HttpError,
  requireAdmin,
  requireStaff,
  type Actor,
} from "../../shared/authorization";
import type {
  createStudentBody,
  createTeacherBody,
  idParams,
  listStudentsQuery,
  listTeachersQuery,
  schedulingStudentsQuery,
  studentPatch,
  teacherPatch
} from "./schemas";


function studentScope(actor: Actor): Prisma.StudentWhereInput {
  if (actor.role === "student") {
    if (!actor.studentId)
      throw new HttpError(403, "Student account is incomplete");
    return { id: actor.studentId };
  }
  if (actor.role === "teacher") {
    if (!actor.teacherId)
      throw new HttpError(403, "Teacher account is incomplete");
    return { enrollments: { some: { teacherId: actor.teacherId } } };
  }
  return {};
}

function teacherScope(actor: Actor): Prisma.TeacherWhereInput {
  if (actor.role === "student")
    throw new HttpError(403, "Staff or teacher access required");
  if (actor.role === "teacher") {
    if (!actor.teacherId)
      throw new HttpError(403, "Teacher account is incomplete");
    return { id: actor.teacherId };
  }
  return {};
}

function profileSelect(actor: Actor) {
  const staff = actor.role === "admin" || actor.role === "manager";
  return {
    id: true,
    firstName: true,
    lastName: true,
    phone: staff,
    user: staff ? { select: { email: true } } : false,
  } as const;
}
export function createPeopleService(db: PrismaClient) {
  return {
    async schedulingStudents(
      actor: Actor,
      query: z.output<typeof schedulingStudentsQuery>,
    ) {
      if (actor.role === "teacher") {
        if (!actor.teacherId)
          throw new HttpError(403, "Teacher account is incomplete");
      } else requireStaff(actor);
      return db.student.findMany({
        skip: query.offset,
        take: query.limit,
        orderBy: { id: "asc" },
        select: {
          id: true,
          status: true,
          profile: { select: { firstName: true, lastName: true } },
        },
      });
    },

    async listStudents(
      actor: Actor,
      query: z.output<typeof listStudentsQuery>,
    ) {
      return db.student.findMany({
        where: studentScope(actor),
        skip: query.offset,
        take: query.limit,
        orderBy: { id: "asc" },
        include: { profile: { select: profileSelect(actor) } },
      });
    },

    async getStudent(
      actor: Actor,
      params: z.output<typeof idParams>,
    ) {
      const student = await db.student.findFirst({
        where: { AND: [{ id: params.id }, studentScope(actor)] },
        include: { profile: { select: profileSelect(actor) } },
      });
      if (!student) throw new HttpError(404, "Student not found");
      return student;
    },

    async createStudent(
      actor: Actor,
      body: z.output<typeof createStudentBody>,
    ) {
      requireStaff(actor);
      const result = await provisionAccount(db, { ...body, role: "student" });
      return {
        id: result.student!.id,
        profileId: result.id,
        role: result.role,
      };
    },

    async updateStudent(
      actor: Actor,
      params: z.output<typeof idParams>,
      body: z.output<typeof studentPatch>,
    ) {
      requireStaff(actor);
      const { firstName, lastName, phone, ...student } = body;
      return db.$transaction(async (tx) => {
        const result = await tx.student.update({
          where: { id: params.id },
          data: {
            ...student,
            profile: { update: { firstName, lastName, phone } },
          },
          include: { profile: { select: profileSelect(actor) } },
        });
        if (firstName !== undefined || lastName !== undefined) {
          await tx.user.update({
            where: { id: result.profileId },
            data: {
              name: [result.profile.firstName, result.profile.lastName]
                .filter(Boolean)
                .join(" "),
            },
          });
        }
        return result;
      });
    },

    async listTeachers(
      actor: Actor,
      query: z.output<typeof listTeachersQuery>,
    ) {
      return db.teacher.findMany({
        where: teacherScope(actor),
        skip: query.offset,
        take: query.limit,
        orderBy: { id: "asc" },
        include: { profile: { select: profileSelect(actor) } },
      });
    },

    async getTeacher(
      actor: Actor,
      params: z.output<typeof idParams>,
    ) {
      const teacher = await db.teacher.findFirst({
        where: { AND: [{ id: params.id }, teacherScope(actor)] },
        include: { profile: { select: profileSelect(actor) } },
      });
      if (!teacher) throw new HttpError(404, "Teacher not found");
      return teacher;
    },

    async createTeacher(
      actor: Actor,
      body: z.output<typeof createTeacherBody>,
    ) {
      requireAdmin(actor);
      const result = await provisionAccount(db, { ...body, role: "teacher" });
      return {
        id: result.teacher!.id,
        profileId: result.id,
        role: result.role,
      };
    },

    async updateTeacher(
      actor: Actor,
      params: z.output<typeof idParams>,
      body: z.output<typeof teacherPatch>,
    ) {
      requireStaff(actor);
      const { firstName, lastName, phone, specialization } = body;
      return db.$transaction(async (tx) => {
        const result = await tx.teacher.update({
          where: { id: params.id },
          data: {
            specialization,
            profile: { update: { firstName, lastName, phone } },
          },
          include: { profile: { select: profileSelect(actor) } },
        });
        if (firstName !== undefined || lastName !== undefined) {
          await tx.user.update({
            where: { id: result.profileId },
            data: {
              name: [result.profile.firstName, result.profile.lastName]
                .filter(Boolean)
                .join(" "),
            },
          });
        }
        return result;
      });
    }
  };
}
