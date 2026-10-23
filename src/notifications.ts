import { Elysia } from "elysia";
import { z } from "zod";
import type { PrismaClient } from "./generated/prisma/client";
import { HttpError, requireStaff, type Actor } from "./authorization";
import { pagination } from "./contracts";

const idParams = z.object({ id: z.uuid() });
const announcement = {
  title: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(5000),
};
const sendBody = z.union([
  z.strictObject({ userId: z.uuid(), ...announcement }),
  z.strictObject({ audience: z.literal("all_students"), ...announcement }),
]);

export function notificationRoutes(db: PrismaClient, actorFor: (request: Request) => Promise<Actor>) {
  return new Elysia()
    .get("/api/notifications/recipients", async ({ request, query, set }) => {
      requireStaff(await actorFor(request));
      set.headers["Cache-Control"] = "private, no-store";
      return db.profile.findMany({
        select: { id: true, firstName: true, lastName: true, role: true },
        orderBy: { id: "asc" }, take: query.limit, skip: query.offset,
      });
    }, { query: pagination })
    .get("/api/notifications", async ({ request, query, set }) => {
      const actor = await actorFor(request);
      set.headers["Cache-Control"] = "private, no-store";
      return db.notification.findMany({
        where: { userId: actor.id, ...(query.unread === "true" ? { isRead: false } : {}) },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: query.limit, skip: query.offset,
      });
    }, { query: pagination.extend({ unread: z.enum(["true", "false"]).optional() }) })
    .get("/api/notifications/unread-count", async ({ request, set }) => {
      const actor = await actorFor(request);
      set.headers["Cache-Control"] = "private, no-store";
      return { count: await db.notification.count({ where: { userId: actor.id, isRead: false } }) };
    })
    .patch("/api/notifications/read-all", async ({ request }) => {
      const actor = await actorFor(request);
      const result = await db.notification.updateMany({ where: { userId: actor.id, isRead: false }, data: { isRead: true } });
      return { updated: result.count };
    })
    .patch("/api/notifications/:id/read", async ({ request, params }) => {
      const actor = await actorFor(request);
      const result = await db.notification.updateMany({ where: { id: params.id, userId: actor.id }, data: { isRead: true } });
      if (!result.count) throw new HttpError(404, "Notification not found");
      return { id: params.id, isRead: true };
    }, { params: idParams })
    .post("/api/notifications", async ({ request, body, set }) => {
      requireStaff(await actorFor(request));
      if ('audience' in body) {
        const students = await db.profile.findMany({ where: { role: "student" }, select: { id: true } });
        if (!students.length) throw new HttpError(422, "There are no student accounts to notify");
        const result = await db.notification.createMany({
          data: students.map(student => ({ userId: student.id, title: body.title, message: body.message, type: "announcement" })),
        });
        set.status = 201;
        return { audience: body.audience, delivered: result.count };
      }
      if (!await db.profile.findUnique({ where: { id: body.userId }, select: { id: true } })) {
        throw new HttpError(422, "Recipient account does not exist");
      }
      const notification = await db.notification.create({ data: { ...body, type: "announcement" } });
      set.status = 201;
      return notification;
    }, { body: sendBody });
}
