import { Elysia } from "elysia";
import type { PrismaClient } from "../../generated/prisma/client";
import type { Actor } from "../../shared/authorization";
import { createProfileService } from "./service";

export function profileRoutes(
  db: PrismaClient,
  actorFor: (request: Request) => Promise<Actor>,
) {
  const service = createProfileService(db);
  return new Elysia()
    .get(
      "/api/me",
      async ({ request }) => {
        return service.get(await actorFor(request));
      },
    );
}
