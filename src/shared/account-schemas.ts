import { z } from "zod";

export const accountInput = z
  .strictObject({
    email: z.email().transform((s) => s.toLowerCase()),
    password: z.string().min(12).max(128),
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().max(80).optional(),
    role: z.enum(["admin", "manager", "teacher", "student"]),
    specialization: z.string().trim().min(1).optional(),
  })
  .refine(
    (v) => v.role !== "teacher" || !!v.specialization,
    "Teachers require a specialization",
  );
