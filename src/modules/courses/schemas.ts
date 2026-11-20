import { z } from "zod";
import { pagination } from "../../shared/pagination";

export const createCourseBody = z.strictObject({
  name: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().max(5000).optional(),
  duration: z.number().int().positive().max(100000).optional(),
  price: z
    .string()
    .regex(
      /^\d{1,10}(\.\d{1,2})?$/,
      "Use a non-negative decimal string with at most two decimal places",
    ),
  teacherId: z.uuid(),
  teachers: z.array(z.strictObject({
    teacherId: z.uuid(),
    weeklySessions: z.number().int().min(1).max(21).optional(),
  })).min(1).max(20).optional(),
  active: z.boolean().default(true),
}).refine((body) => !body.teachers || (
  body.teachers.some((t) => t.teacherId === body.teacherId) &&
  new Set(body.teachers.map((t) => t.teacherId)).size === body.teachers.length
), "Course teachers must be unique and include the default teacher");

export const listQuery = pagination;
