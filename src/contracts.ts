import { z } from "zod";

export const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});
export const createCourseBody = z.strictObject({
  name: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().max(5000).optional(),
  duration: z.number().int().positive().max(100000).optional(),
  price: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Use a non-negative decimal string with at most two decimal places"),
  teacherId: z.uuid(),
  active: z.boolean().default(true),
});
export const createEnrollmentBody = z.strictObject({ studentId: z.uuid(), courseId: z.uuid() });
export const accountInput = z.strictObject({
  email: z.email().transform((s) => s.toLowerCase()),
  password: z.string().min(12).max(128),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional(),
  role: z.enum(["admin", "manager", "teacher", "student"]),
  specialization: z.string().trim().min(1).optional(),
}).refine((v) => v.role !== "teacher" || !!v.specialization, "Teachers require a specialization");
