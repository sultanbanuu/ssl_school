import { Elysia } from "elysia";
import { z } from "zod";
import type { PrismaClient } from "./generated/prisma/client";
import { HttpError, requireAdmin, type Actor } from "./authorization";

const promotion = z.discriminatedUnion("role", [
  z.strictObject({ role: z.literal("teacher"), specialization: z.string().trim().min(1).max(200) }),
  z.strictObject({ role: z.literal("manager") }),
]);

export function roleRoutes(db: PrismaClient, actorFor: (request: Request) => Promise<Actor>) {
  return new Elysia().patch("/api/users/:id/role", async ({ request, params, body }) => {
    requireAdmin(await actorFor(request));
    return db.$transaction(async (tx) => {
      const profile = await tx.profile.findUnique({ where: { id: params.id } });
      if (!profile) throw new HttpError(404, "User not found");
      // Conditional update prevents concurrent promotions from creating two roles.
      const changed = await tx.profile.updateMany({
        where: { id: params.id, role: "student" }, data: { role: body.role },
      });
      if (changed.count !== 1) throw new HttpError(409, "Only student accounts can be promoted");
      if (body.role === "teacher") {
        await tx.teacher.create({ data: { profileId: params.id, specialization: body.specialization } });
      } else {
        await tx.manager.create({ data: { profileId: params.id } });
      }
      // Preserve the student record and any enrollment/payment history.
      await tx.session.deleteMany({ where: { userId: params.id } });
      return { id: params.id, role: body.role };
    });
  }, { params: z.object({ id: z.uuid() }), body: promotion });
}
