import { z } from "zod";
import { bounds, DAY, dayNumber } from "../../scheduling";
import { pagination } from "../../shared/pagination";

export const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const slot = z
  .strictObject({
    date: z.iso.date(),
    endDate: z.iso.date().optional(),
    startTime: time,
    endTime: time,
    allDay: z.boolean().optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable()
      .optional(),
    reminderMinutes: z.number().int().min(0).max(10080).nullable().optional(),
  })
  .refine((v) => {
    const [a, b] = bounds(v);
    return b > a && b - a <= 31 * DAY;
  }, "Choose a positive duration of at most 31 days");
export const repeat = z.strictObject({
  frequency: z.enum(["daily", "weekly"]),
  interval: z.number().int().min(1).max(52),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  until: z.iso.date(),
});
export const createBody = slot
  .safeExtend({
    enrollmentId: z.uuid(),
    teacherId: z.uuid().optional(),
    repeat: repeat.optional(),
  })
  .refine((v) => !v.repeat ||
    (v.repeat.until >= v.date &&
      dayNumber(v.repeat.until) - dayNumber(v.date) <= 366 * DAY), "Repeat must end within one year");
export const editBody = slot.safeExtend({
  teacherId: z.uuid().optional(),
  scope: z.enum(["one", "future"]).optional(),
});
export const idParams = z.object({ id: z.uuid() });
export const listQuery = pagination
  .extend({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    status: z.enum(["scheduled", "completed", "cancelled"]).optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to);
export const removeQuery = z.object({ scope: z.enum(["one", "all"]).default("one") });
export const updateBody = z.union([
  editBody,
  z.strictObject({
    status: z.literal("cancelled"),
    scope: z.enum(["one", "future", "all"]).optional(),
  }),
  z.strictObject({
    status: z.literal("completed"),
    scope: z.enum(["one", "future", "all"]).optional(),
    includeEarlier: z.boolean().optional(),
  }),
]);
