import type { z } from "zod";
import type { PrismaClient } from "../../generated/prisma/client";
import { HttpError, requireStaff, type Actor } from "../../shared/authorization";
import type {
  idParams,
  listQuery,
  recipientsQuery,
  sendBody
} from "./schemas";

export function createNotificationService(db: PrismaClient) {
  return {
    async recipients(
      actor: Actor,
      query: z.output<typeof recipientsQuery>,
    ) {
      requireStaff(actor);
      return db.profile.findMany({
        select: { id: true, firstName: true, lastName: true, role: true },
        orderBy: { id: "asc" },
        take: query.limit,
        skip: query.offset,
      });
    },

    async list(
      actor: Actor,
      query: z.output<typeof listQuery>,
    ) {
      return db.notification.findMany({
        where: {
          userId: actor.id,
          ...(query.unread === "true" ? { isRead: false } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: query.limit,
        skip: query.offset,
      });
    },

    async unreadCount(
      actor: Actor,
    ) {
      return {
        count: await db.notification.count({
          where: { userId: actor.id, isRead: false },
        }),
      };
    },

    async readAll(
      actor: Actor,
    ) {
      const result = await db.notification.updateMany({
        where: { userId: actor.id, isRead: false },
        data: { isRead: true },
      });
      return { updated: result.count };
    },

    async read(
      actor: Actor,
      params: z.output<typeof idParams>,
    ) {
      const result = await db.notification.updateMany({
        where: { id: params.id, userId: actor.id },
        data: { isRead: true },
      });
      if (!result.count) throw new HttpError(404, "Notification not found");
      return { id: params.id, isRead: true };
    },

    async send(
      actor: Actor,
      body: z.output<typeof sendBody>,
    ) {
      requireStaff(actor);
      if ("audience" in body) {
        const students = await db.profile.findMany({
          where: { role: "student" },
          select: { id: true },
        });
        if (!students.length)
          throw new HttpError(422, "There are no student accounts to notify");
        const result = await db.notification.createMany({
          data: students.map((student) => ({
            userId: student.id,
            title: body.title,
            message: body.message,
            type: "announcement",
          })),
        });
        return { audience: body.audience, delivered: result.count };
      }
      if (
        !(await db.profile.findUnique({
          where: { id: body.userId },
          select: { id: true },
        }))
      ) {
        throw new HttpError(422, "Recipient account does not exist");
      }
      const notification = await db.notification.create({
        data: { ...body, type: "announcement" },
      });
      return notification;
    }
  };
}
