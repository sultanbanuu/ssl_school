import type { PrismaClient } from "../../generated/prisma/client";
import { type Actor } from "../../shared/authorization";

export function createProfileService(db: PrismaClient) {
  return {
    async get(
      actor: Actor,
    ) {
      return db.profile.findUnique({
        where: { id: actor.id },
        include: { student: true, teacher: true },
      });
    }
  };
}
