import type { PrismaClient } from "../../generated/prisma/client";

export function createHealthService(db: PrismaClient) {
  return {
    liveness() {
      return { status: "ok", service: "ssl-school-api" };
    },

    async readiness() {
      try {
        await db.$queryRaw`SELECT 1`;
        return { status: "ready" as const };
      } catch {
        return { status: "unavailable" as const };
      }
    },
  };
}
