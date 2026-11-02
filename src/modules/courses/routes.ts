import { Elysia } from "elysia";
import type { PrismaClient } from "../../generated/prisma/client";
import type { Actor } from "../../shared/authorization";
import {
  createCourseBody,
  listQuery,
} from "./schemas";
import { createCourseService } from "./service";

export function courseRoutes(
  db: PrismaClient,
  actorFor: (request: Request) => Promise<Actor>,
) {
  const service = createCourseService(db);
  return new Elysia()
    .get(
      "/api/courses",
      async ({ request, query }) => {
        return service.list(await actorFor(request), query);
      },
      { query: listQuery },
    )
    .post(
      "/api/courses",
      async ({ request, body, set }) => {
        const result = await service.create(await actorFor(request), body);
        set.status = 201;
        return result;
      },
      { body: createCourseBody },
    );
}
