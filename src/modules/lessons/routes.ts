import { Elysia } from "elysia";
import type { PrismaClient } from "../../generated/prisma/client";
import type { Actor } from "../../shared/authorization";
import {
  createBody,
  idParams,
  listQuery,
  removeQuery,
  updateBody,
} from "./schemas";
import { createLessonService } from "./service";

export function lessonRoutes(
  db: PrismaClient,
  actorFor: (request: Request) => Promise<Actor>,
) {
  const service = createLessonService(db);
  return new Elysia()
    .get(
      "/api/lessons/:id/status-options",
      async ({ request, params }) => {
        return service.statusOptions(await actorFor(request), params);
      },
      { params: idParams },
    )
    .get(
      "/api/lessons",
      async ({ request, query }) => {
        return service.list(await actorFor(request), query);
      },
      { query: listQuery },
    )
    .post(
      "/api/lessons",
      async ({ request, body, set }) => {
        const result = await service.create(await actorFor(request), body);
        set.status = 201;
        return result;
      },
      { body: createBody },
    )
    .delete(
      "/api/lessons/:id",
      async ({ request, params, query }) => {
        return service.remove(await actorFor(request), params, query);
      },
      { params: idParams, query: removeQuery },
    )
    .patch(
      "/api/lessons/:id",
      async ({ request, params, body }) => {
        return service.update(await actorFor(request), params, body);
      },
      { params: idParams, body: updateBody },
    );
}
