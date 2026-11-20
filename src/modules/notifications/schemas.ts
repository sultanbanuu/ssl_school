import { z } from "zod";
import { pagination } from "../../shared/pagination";
import { webSubscription } from "../../web-push";

export const idParams = z.object({ id: z.uuid() });
export const deviceBody = z.strictObject({
  token: z.union([
    z.string().max(256).regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/),
    z.string().max(1800).refine(value => {
      if (!value.startsWith("web:")) return false;
      try { return webSubscription.safeParse(JSON.parse(value.slice(4))).success; } catch { return false; }
    }, "Invalid browser push subscription"),
  ]),
});

export const announcement = {
  title: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(500),
};

export const sendBody = z.union([
  z.strictObject({ userId: z.uuid(), ...announcement }),
  z.strictObject({ audience: z.literal("all_students"), ...announcement }),
]);

export const recipientsQuery = pagination;

export const listQuery = pagination.extend({
  unread: z.enum(["true", "false"]).optional(),
});
