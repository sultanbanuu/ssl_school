import { Elysia } from "elysia";
import type { PrismaClient } from "../../generated/prisma/client";
import { createHealthService } from "./service";

export function healthRoutes(db: PrismaClient) {
  const service = createHealthService(db);
  return new Elysia()
    .get("/health", () => service.liveness())
    .get("/ready", async ({ set }) => {
      const result = await service.readiness();
      if (result.status === "unavailable") set.status = 503;
      return result;
    });
}
