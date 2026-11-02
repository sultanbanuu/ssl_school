import { z } from "zod";

export const promotion = z.discriminatedUnion("role", [
  z.strictObject({
    role: z.literal("teacher"),
    specialization: z.string().trim().min(1).max(200),
  }),
  z.strictObject({ role: z.literal("manager") }),
]);

export const promoteParams = z.object({ id: z.uuid() });
