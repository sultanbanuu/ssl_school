import { Elysia } from "elysia";
import { z } from "zod";
import { signupName } from "../auth/schemas";
import { phoneSchema } from "../../shared/phone";
import type { PrismaClient } from "../../generated/prisma/client";
import type { Actor } from "../../shared/authorization";
import { createProfileService } from "./service";

export function profileRoutes(
  db: PrismaClient,
  actorFor: (request: Request) => Promise<Actor>,
) {
  const service = createProfileService(db);
  return new Elysia()
    .patch("/api/me", async ({ request, body }) => service.update(await actorFor(request), body), {
      body: z.object({ firstName: signupName, lastName: signupName, email: z.string().trim().toLowerCase().email().max(254), phone: phoneSchema }).strict(),
    })
    .patch("/api/me/phone", async ({ request, body }) => service.updatePhone(await actorFor(request), body.phone), {
      body: z.object({ phone: phoneSchema }).strict(),
    })
    .get(
      "/api/me",
      async ({ request }) => {
        return service.get(await actorFor(request));
      },
    );
}
