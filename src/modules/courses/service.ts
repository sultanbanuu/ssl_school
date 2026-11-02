import type { z } from "zod";
import type { PrismaClient } from "../../generated/prisma/client";
import { courseScope, requireStaff, type Actor } from "../../shared/authorization";
import type {
  createCourseBody,
  listQuery,
} from "./schemas";

export function createCourseService(db: PrismaClient) {
  return {
    async list(
      actor: Actor,
      query: z.output<typeof listQuery>,
    ) {
      const records = await db.course.findMany({
        where: courseScope(actor),
        take: query.limit,
        skip: query.offset,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      });
      return records.map((course) => ({
        ...course,
        duration: course.duration?.toString() ?? null,
        price: course.price.toFixed(2),
      }));
    },

    async create(
      actor: Actor,
      body: z.output<typeof createCourseBody>,
    ) {
      requireStaff(actor);
      const course = await db.course.create({
        data: {
          ...body,
          duration:
            body.duration === undefined ? undefined : BigInt(body.duration),
        },
      });
      return {
        ...course,
        duration: course.duration?.toString() ?? null,
        price: course.price.toFixed(2),
      };
    }
  };
}
