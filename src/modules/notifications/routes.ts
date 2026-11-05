import { Elysia } from "elysia";
import type { PrismaClient } from "../../generated/prisma/client";
import type { Actor } from "../../shared/authorization";
import {
  idParams,
  deviceBody,
  listQuery,
  recipientsQuery,
  sendBody,
} from "./schemas";
import { createNotificationService } from "./service";

export function notificationRoutes(
  db: PrismaClient,
  actorFor: (request: Request) => Promise<Actor>,
) {
  const service = createNotificationService(db);
  return new Elysia()
    .post("/api/notifications/devices", async ({ request, body }) => {
      return service.registerDevice(await actorFor(request), body.token);
    }, { body: deviceBody })
    .delete("/api/notifications/devices", async ({ request, body }) => {
      return service.removeDevice(await actorFor(request), body.token);
    }, { body: deviceBody })
    .get(
      "/api/notifications/recipients",
      async ({ request, query, set }) => {
        const result = await service.recipients(await actorFor(request), query);
        set.headers["Cache-Control"] = "private, no-store";
        return result;
      },
      { query: recipientsQuery },
    )
    .get(
      "/api/notifications",
      async ({ request, query, set }) => {
        const result = await service.list(await actorFor(request), query);
        set.headers["Cache-Control"] = "private, no-store";
        return result;
      },
      { query: listQuery },
    )
    .get(
      "/api/notifications/unread-count",
      async ({ request, set }) => {
        const result = await service.unreadCount(await actorFor(request));
        set.headers["Cache-Control"] = "private, no-store";
        return result;
      },
    )
    .patch(
      "/api/notifications/read-all",
      async ({ request }) => {
        return service.readAll(await actorFor(request));
      },
    )
    .patch(
      "/api/notifications/:id/read",
      async ({ request, params }) => {
        return service.read(await actorFor(request), params);
      },
      { params: idParams },
    )
    .post(
      "/api/notifications",
      async ({ request, body, set }) => {
        const result = await service.send(await actorFor(request), body);
        set.status = 201;
        return result;
      },
      { body: sendBody },
    );
}
