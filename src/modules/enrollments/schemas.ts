import { z } from "zod";
import { pagination } from "../../shared/pagination";

export const createEnrollmentBody = z.strictObject({
  studentId: z.uuid(),
  courseId: z.uuid(),
});

export const listQuery = pagination;
