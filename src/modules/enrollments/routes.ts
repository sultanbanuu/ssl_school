import { Elysia } from "elysia";
import type { PrismaClient } from "../../generated/prisma/client";
import type { Actor } from "../../shared/authorization";
import {
  createEnrollmentBody,
  idParams,
  listQuery,
  updateEnrollmentBody,
} from "./schemas";
import { createEnrollmentService } from "./service";

export function enrollmentRoutes(
  db: PrismaClient,
  actorFor: (request: Request) => Promise<Actor>,
) {
  const service = createEnrollmentService(db);
  return new Elysia()
    .get(
      "/api/enrollments",
      async ({ request, query }) => {
        return service.list(await actorFor(request), query);
      },
      { query: listQuery },
    )
    .post(
      "/api/enrollments",
      async ({ request, body, set }) => {
        const result = await service.create(await actorFor(request), body);
        set.status = 201;
        return result;
      },
      { body: createEnrollmentBody },
    )
    .patch(
      "/api/enrollments/:id",
      async ({ request, params, body }) =>
        service.update(await actorFor(request), params.id, body),
      { params: idParams, body: updateEnrollmentBody },
    );
}
