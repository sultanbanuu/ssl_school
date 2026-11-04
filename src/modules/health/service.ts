import type { PrismaClient } from "../../generated/prisma/client";

export function createHealthService(db: PrismaClient) {
  return {
    liveness() {
      return { status: "ok", service: "ssl-school-api" };
    },

    async readiness() {
      try {
        await db.$queryRaw`SELECT 1`;
        // Query every scalar auth-user column, including newly generated fields.
        // A live connection alone cannot detect a missing migration.
        await db.user.findFirst();
        return { status: "ready" as const };
      } catch {
        return { status: "unavailable" as const };
      }
    },
  };
}
