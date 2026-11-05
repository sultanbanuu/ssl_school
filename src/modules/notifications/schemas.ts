import { z } from "zod";
import { pagination } from "../../shared/pagination";

export const idParams = z.object({ id: z.uuid() });
export const deviceBody = z.strictObject({
  token: z.string().max(256).regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/),
});

export const announcement = {
  title: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(5000),
};

export const sendBody = z.union([
  z.strictObject({ userId: z.uuid(), ...announcement }),
  z.strictObject({ audience: z.literal("all_students"), ...announcement }),
]);

export const recipientsQuery = pagination;

export const listQuery = pagination.extend({
  unread: z.enum(["true", "false"]).optional(),
});
