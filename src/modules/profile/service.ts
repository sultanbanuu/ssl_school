import type { PrismaClient } from "../../generated/prisma/client";
import { HttpError, type Actor } from "../../shared/authorization";

export function createProfileService(db: PrismaClient) {
  return {
    async update(actor: Actor, data: { firstName: string; lastName: string; email: string; phone: string }) {
      if (actor.role !== "student") throw new HttpError(403, "Student access required");
      try {
        return await db.$transaction(async tx => {
          const current = await tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { email: true } });
          const { email, ...details } = data;
          await tx.user.update({ where: { id: actor.id }, data: { ...details, email, name: `${data.firstName} ${data.lastName}`, ...(current.email !== email ? { emailVerified: false } : {}) } });
          const profile = await tx.profile.update({ where: { id: actor.id }, data: details, include: { student: true, teacher: true } });
          return { ...profile, email };
        });
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") throw new HttpError(409, "This email address is already in use.");
        throw error;
      }
    },
    async updatePhone(actor: Actor, phone: string) {
      if (actor.role !== "student") throw new HttpError(403, "Student access required");
      return db.$transaction(async tx => {
        await tx.user.update({ where: { id: actor.id }, data: { phone } });
        return tx.profile.update({ where: { id: actor.id }, data: { phone }, select: { phone: true } });
      });
    },
    async get(
      actor: Actor,
    ) {
      const profile = await db.profile.findUnique({
        where: { id: actor.id },
        include: { student: true, teacher: true, user: { select: { email: true } } },
      });
      if (!profile) return null;
      const { user, ...details } = profile;
      return { ...details, email: user.email };
    }
  };
}
