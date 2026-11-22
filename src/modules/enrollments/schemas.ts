import { z } from "zod";
import { pagination } from "../../shared/pagination";

export const createEnrollmentBody = z.strictObject({
  studentId: z.uuid(),
  courseId: z.uuid(),
  // Required for per-lesson courses; rejected for monthly ones.
  lessonCount: z.number().int().min(1).max(100).optional(),
});

export const idParams = z.object({ id: z.uuid() });
export const updateEnrollmentBody = z.strictObject({
  lessonCount: z.number().int().min(1).max(100),
});

export const listQuery = pagination;
