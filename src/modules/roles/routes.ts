import { Elysia } from "elysia";
import type { PrismaClient } from "../../generated/prisma/client";
import type { Actor } from "../../shared/authorization";
import {
  promoteParams,
  promotion,
} from "./schemas";
import { createRoleService } from "./service";

export function roleRoutes(
  db: PrismaClient,
  actorFor: (request: Request) => Promise<Actor>,
) {
  const service = createRoleService(db);
  return new Elysia()
    .patch(
      "/api/users/:id/role",
      async ({ request, params, body }) => {
        return service.promote(await actorFor(request), params, body);
      },
      { params: promoteParams, body: promotion },
    );
}
