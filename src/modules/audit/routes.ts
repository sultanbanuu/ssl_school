import { Elysia } from "elysia";
import { z } from "zod";
import type { PrismaClient } from "../../generated/prisma/client";
import { requireAdmin, type Actor } from "../../shared/authorization";
import { pagination } from "../../shared/pagination";

export const auditQuery = pagination.extend({
  entityType: z.enum(["payment", "role", "lesson", "availability", "trial", "reschedule"]).optional(),
  entityId: z.uuid().optional(),
  actorId: z.uuid().optional(),
  action: z.enum(["created", "updated", "deleted"]).optional(),
});

export function auditRoutes(db: PrismaClient, actorFor: (request: Request) => Promise<Actor>) {
  return new Elysia().get("/api/audit-logs", async ({ request, query, set }) => {
    requireAdmin(await actorFor(request));
    const { limit, offset, ...where } = query;
    set.headers["Cache-Control"] = "private, no-store";
    const rows = await db.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1, skip: offset });
    return { items: rows.slice(0, limit), hasMore: rows.length > limit };
  }, { query: auditQuery });
}
