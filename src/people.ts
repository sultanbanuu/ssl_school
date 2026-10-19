import { Elysia } from "elysia";
import { z } from "zod";
import type { PrismaClient, Prisma } from "./generated/prisma/client";
import { HttpError, requireStaff, type Actor } from "./authorization";
import { pagination } from "./contracts";
import { provisionAccount } from "./accounts";

const identity = {
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80),
};
const credentials = {
  email: z.email().transform((v) => v.toLowerCase()),
  password: z.string().min(12).max(128),
  firstName: identity.firstName,
  lastName: identity.lastName.optional(),
};
const profileFields = { ...identity, phone: z.string().trim().max(40).nullable() };
const studentPatch = z.strictObject({
  ...profileFields,
  englishLevel: z.string().trim().max(80).nullable(),
  learningGoal: z.string().trim().max(2000).nullable(),
  status: z.enum(["active", "inactive"]),
}).partial().refine((v) => Object.keys(v).length > 0, "Supply at least one field");
const teacherPatch = z.strictObject({
  ...profileFields, specialization: z.string().trim().min(1).max(200),
}).partial().refine((v) => Object.keys(v).length > 0, "Supply at least one field");
const idParams = z.object({ id: z.uuid() });

function studentScope(actor: Actor): Prisma.StudentWhereInput {
  if (actor.role === "student") {
    if (!actor.studentId) throw new HttpError(403, "Student account is incomplete");
    return { id: actor.studentId };
  }
  if (actor.role === "teacher") {
    if (!actor.teacherId) throw new HttpError(403, "Teacher account is incomplete");
    return { enrollments: { some: { teacherId: actor.teacherId } } };
  }
  return {};
}
function teacherScope(actor: Actor): Prisma.TeacherWhereInput {
  if (actor.role === "student") throw new HttpError(403, "Staff or teacher access required");
  if (actor.role === "teacher") {
    if (!actor.teacherId) throw new HttpError(403, "Teacher account is incomplete");
    return { id: actor.teacherId };
  }
  return {};
}
function profileSelect(actor: Actor) {
  const staff = actor.role === "admin" || actor.role === "manager";
  return { id: true, firstName: true, lastName: true, phone: staff, user: staff ? { select: { email: true } } : false } as const;
}

export function peopleRoutes(db: PrismaClient, actorFor: (request: Request) => Promise<Actor>) {
  return new Elysia()
    .get("/api/students", async ({ request, query }) => {
      const actor = await actorFor(request);
      return db.student.findMany({ where: studentScope(actor), skip: query.offset, take: query.limit, orderBy: { id: "asc" }, include: { profile: { select: profileSelect(actor) } } });
    }, { query: pagination })
    .get("/api/students/:id", async ({ request, params }) => {
      const actor = await actorFor(request);
      const student = await db.student.findFirst({ where: { AND: [{ id: params.id }, studentScope(actor)] }, include: { profile: { select: profileSelect(actor) } } });
      if (!student) throw new HttpError(404, "Student not found");
      return student;
    }, { params: idParams })
    .post("/api/students", async ({ request, body, set }) => {
      requireStaff(await actorFor(request));
      const result = await provisionAccount(db, { ...body, role: "student" });
      set.status = 201;
      return { id: result.student!.id, profileId: result.id, role: result.role };
    }, { body: z.strictObject(credentials) })
    .patch("/api/students/:id", async ({ request, params, body }) => {
      const actor = await actorFor(request);
      requireStaff(actor);
      const { firstName, lastName, phone, ...student } = body;
      return db.$transaction(async (tx) => {
        const result = await tx.student.update({ where: { id: params.id }, data: {
          ...student, profile: { update: { firstName, lastName, phone } },
        }, include: { profile: { select: profileSelect(actor) } } });
        if (firstName !== undefined || lastName !== undefined) {
          await tx.user.update({ where: { id: result.profileId }, data: { name: [result.profile.firstName, result.profile.lastName].filter(Boolean).join(" ") } });
        }
        return result;
      });
    }, { params: idParams, body: studentPatch })
    .get("/api/teachers", async ({ request, query }) => {
      const actor = await actorFor(request);
      return db.teacher.findMany({ where: teacherScope(actor), skip: query.offset, take: query.limit, orderBy: { id: "asc" }, include: { profile: { select: profileSelect(actor) } } });
    }, { query: pagination })
    .get("/api/teachers/:id", async ({ request, params }) => {
      const actor = await actorFor(request);
      const teacher = await db.teacher.findFirst({ where: { AND: [{ id: params.id }, teacherScope(actor)] }, include: { profile: { select: profileSelect(actor) } } });
      if (!teacher) throw new HttpError(404, "Teacher not found");
      return teacher;
    }, { params: idParams })
    .post("/api/teachers", async ({ request, body, set }) => {
      requireStaff(await actorFor(request));
      const result = await provisionAccount(db, { ...body, role: "teacher" });
      set.status = 201;
      return { id: result.teacher!.id, profileId: result.id, role: result.role };
    }, { body: z.strictObject({ ...credentials, specialization: z.string().trim().min(1).max(200) }) })
    .patch("/api/teachers/:id", async ({ request, params, body }) => {
      const actor = await actorFor(request);
      requireStaff(actor);
      const { firstName, lastName, phone, specialization } = body;
      return db.$transaction(async (tx) => {
        const result = await tx.teacher.update({ where: { id: params.id }, data: {
          specialization, profile: { update: { firstName, lastName, phone } },
        }, include: { profile: { select: profileSelect(actor) } } });
        if (firstName !== undefined || lastName !== undefined) {
          await tx.user.update({ where: { id: result.profileId }, data: { name: [result.profile.firstName, result.profile.lastName].filter(Boolean).join(" ") } });
        }
        return result;
      });
    }, { params: idParams, body: teacherPatch });
}
