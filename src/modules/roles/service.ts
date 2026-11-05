import { setAuditActor } from "../../shared/audit";
import type { z } from "zod";
import type { PrismaClient } from "../../generated/prisma/client";
import { HttpError, requireAdmin, type Actor } from "../../shared/authorization";
import type {
  promoteParams,
  promotion,
} from "./schemas";

export function createRoleService(db: PrismaClient) {
  return {
    async promote(
      actor: Actor,
      params: z.output<typeof promoteParams>,
      body: z.output<typeof promotion>,
    ) {
      requireAdmin(actor);
      return db.$transaction(async (tx) => {
          await setAuditActor(tx, actor);
        const profile = await tx.profile.findUnique({
          where: { id: params.id },
        });
        if (!profile) throw new HttpError(404, "User not found");
        // Conditional update prevents concurrent promotions from creating two roles.
        const changed = await tx.profile.updateMany({
          where: { id: params.id, role: "student" },
          data: { role: body.role },
        });
        if (changed.count !== 1)
          throw new HttpError(409, "Only student accounts can be promoted");
        if (body.role === "teacher") {
          await tx.teacher.create({
            data: { profileId: params.id, specialization: body.specialization },
          });
        } else {
          await tx.manager.create({ data: { profileId: params.id } });
        }
        // Preserve the student record and any enrollment/payment history.
        await tx.session.deleteMany({ where: { userId: params.id } });
        return { id: params.id, role: body.role };
      });
    }
  };
}
