import { z } from "zod";
import { MAX_RECEIPT_SIZE } from "../../receipt-storage";
import { pagination } from "../../shared/pagination";

export const idParams = z.object({ id: z.uuid() });
export const createUploadBody = z.strictObject({
  courseId: z.uuid(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive().max(MAX_RECEIPT_SIZE),
});
export const submitBody = z.strictObject({ uploadId: z.uuid() });
export const reviewBody = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("approved"), startDate: z.iso.date() }),
  z.strictObject({
    status: z.literal("cancelled"),
    cancellationReason: z.string().trim().min(1).max(1000).optional(),
  }),
]);
export const coursesQuery = pagination;
export const listQuery = pagination.extend({
  status: z.enum(["pending", "approved", "cancelled"]).optional(),
});
