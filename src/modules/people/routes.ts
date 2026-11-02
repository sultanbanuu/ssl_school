import { Elysia } from "elysia";
import type { PrismaClient } from "../../generated/prisma/client";
import type { Actor } from "../../shared/authorization";
import {
  createStudentBody,
  createTeacherBody,
  idParams,
  listStudentsQuery,
  listTeachersQuery,
  schedulingStudentsQuery,
  studentPatch,
  teacherPatch,
} from "./schemas";
import { createPeopleService } from "./service";

export function peopleRoutes(
  db: PrismaClient,
  actorFor: (request: Request) => Promise<Actor>,
) {
  const service = createPeopleService(db);
  return new Elysia()
    .get(
      "/api/scheduling-students",
      async ({ request, query }) => {
        return service.schedulingStudents(await actorFor(request), query);
      },
      { query: schedulingStudentsQuery },
    )
    .get(
      "/api/students",
      async ({ request, query }) => {
        return service.listStudents(await actorFor(request), query);
      },
      { query: listStudentsQuery },
    )
    .get(
      "/api/students/:id",
      async ({ request, params }) => {
        return service.getStudent(await actorFor(request), params);
      },
      { params: idParams },
    )
    .post(
      "/api/students",
      async ({ request, body, set }) => {
        const result = await service.createStudent(await actorFor(request), body);
        set.status = 201;
        return result;
      },
      { body: createStudentBody },
    )
    .patch(
      "/api/students/:id",
      async ({ request, params, body }) => {
        return service.updateStudent(await actorFor(request), params, body);
      },
      { params: idParams, body: studentPatch },
    )
    .get(
      "/api/teachers",
      async ({ request, query }) => {
        return service.listTeachers(await actorFor(request), query);
      },
      { query: listTeachersQuery },
    )
    .get(
      "/api/teachers/:id",
      async ({ request, params }) => {
        return service.getTeacher(await actorFor(request), params);
      },
      { params: idParams },
    )
    .post(
      "/api/teachers",
      async ({ request, body, set }) => {
        const result = await service.createTeacher(await actorFor(request), body);
        set.status = 201;
        return result;
      },
      { body: createTeacherBody },
    )
    .patch(
      "/api/teachers/:id",
      async ({ request, params, body }) => {
        return service.updateTeacher(await actorFor(request), params, body);
      },
      { params: idParams, body: teacherPatch },
    );
}
