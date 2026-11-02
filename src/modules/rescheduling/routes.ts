import { Elysia } from "elysia";
import { z } from "zod";
import type { PrismaClient } from "../../generated/prisma/client";
import type { Actor } from "../../shared/authorization";
import { createReschedulingService } from "./service";
const params = z.object({ id: z.uuid() });
const query = z.object({ offset: z.coerce.number().int().min(0).max(100000).default(0) });
export function reschedulingRoutes(db: PrismaClient, actorFor: (request: Request) => Promise<Actor>) {
  const s = createReschedulingService(db);
  return new Elysia()
    .get("/api/lessons/:id/reschedule-options", async ({ request, params, query }) => s.options(await actorFor(request), params.id, query.offset), { params, query: z.object({ offset: z.coerce.number().int().min(0).max(49).default(0) }) })
    .post("/api/lessons/:id/reschedule-requests", async ({ request, params, body, set }) => { const result = await s.request(await actorFor(request), params.id, body.startsAt); set.status = 201; return result; }, { params, body: z.object({ startsAt: z.iso.datetime({ offset: true }) }) })
    .get("/api/reschedule-requests", async ({ request, query }) => s.list(await actorFor(request), query.offset), { query })
    .patch("/api/reschedule-requests/:id", async ({ request, params, body }) => s.review(await actorFor(request), params.id, body.status, body.note), { params, body: z.object({ status: z.enum(["approved", "rejected"]), note: z.string().trim().max(500).optional() }) })
    .patch("/api/reschedule-requests/:id/quota", async ({ request, params, body }) => s.waive(await actorFor(request), params.id, body.reason), { params, body: z.object({ reason: z.string().trim().min(3).max(500) }) })
    .post("/api/lessons/:id/cancel", async ({ request, params }) => s.cancel(await actorFor(request), params.id), { params })
    .get("/api/student-cancellations", async ({ request, query }) => s.cancellations(await actorFor(request), query.offset), { query })
    .post("/api/lessons/:id/restore", async ({ request, params }) => s.restore(await actorFor(request), params.id), { params });
}
