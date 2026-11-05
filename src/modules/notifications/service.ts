import type { z } from "zod";
import type { PrismaClient } from "../../generated/prisma/client";
import { HttpError, requireAdmin, type Actor } from "../../shared/authorization";
import type {
  idParams,
  listQuery,
  recipientsQuery,
  sendBody
} from "./schemas";

export function createNotificationService(db: PrismaClient) {
  return {
    async registerDevice(actor: Actor, token: string) {
      if (actor.role !== "student") throw new HttpError(403, "Student access required");
      await db.$transaction(async tx => {
        // Discard queued messages before transferring a shared device to a new account.
        await tx.pushDevice.deleteMany({ where: { token, userId: { not: actor.id } } });
        await tx.pushDevice.upsert({ where: { token }, create: { token, userId: actor.id }, update: {} });
      });
      return { registered: true };
    },
    async removeDevice(actor: Actor, token: string) {
      await db.pushDevice.deleteMany({ where: { token, userId: actor.id } });
      return { removed: true };
    },
    async recipients(
      actor: Actor,
      query: z.output<typeof recipientsQuery>,
    ) {
      requireAdmin(actor);
      return db.profile.findMany({
        where: { role: "student" },
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
      requireAdmin(actor);
      if ("audience" in body) {
        const students = await db.profile.findMany({
          where: { role: "student" },
          select: { id: true },
        });
        if (!students.length)
          throw new HttpError(422, "There are no student accounts to notify");
        const rows = students.map((student) => ({
            id: crypto.randomUUID(),
            userId: student.id,
            title: body.title,
            message: body.message,
            type: "announcement",
          }));
        const result = await db.$transaction(async tx => {
          const result = await tx.notification.createMany({ data: rows });
          const devices = await tx.pushDevice.findMany({ where: { userId: { in: students.map(s => s.id) } } });
          const ids = new Map(rows.map(row => [row.userId, row.id]));
          if (devices.length) await tx.pushDelivery.createMany({ data: devices.map(device => ({ notificationId: ids.get(device.userId)!, token: device.token })) });
          return result;
        });
        return { audience: body.audience, delivered: result.count };
      }
      const recipient = await db.profile.findUnique({
          where: { id: body.userId },
          select: { id: true, role: true },
        });
      if (!recipient || recipient.role !== "student") {
        throw new HttpError(422, "Recipient must be a student account");
      }
      const notification = await db.$transaction(async tx => {
        const notification = await tx.notification.create({ data: { ...body, type: "announcement" } });
        const devices = await tx.pushDevice.findMany({ where: { userId: body.userId } });
        if (devices.length) await tx.pushDelivery.createMany({ data: devices.map(device => ({ notificationId: notification.id, token: device.token })) });
        return notification;
      });
      return notification;
    }
  };
}
