import { z } from "zod";
import { DAY, dayNumber, minutes } from "../../scheduling";
import { pagination } from "../../shared/pagination";
import { workingMinutes } from "../../teacher-hours";

export const slotBody = z
  .strictObject({
    teacherId: z.uuid(),
    courseId: z.uuid(),
    date: z.iso.date(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
  })
  .refine(
    (v) =>
      workingMinutes("Sayad", v.date).some(([start, end]) => minutes(v.startTime) >= start && minutes(v.endTime) <= end) &&
      minutes(v.endTime) - minutes(v.startTime) === 15 &&
      [v.startTime, v.endTime].every(
        (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t) && minutes(t) % 15 === 0,
      ),
    "Choose a 15-minute trial within Sayad's working hours: weekdays 10–11 or 15–23:30; Saturday 12:30–23:30",
  );

export const listQuery = pagination
  .extend({ from: z.iso.date(), to: z.iso.date() })
  .refine(
    (v) =>
      v.to >= v.from && dayNumber(v.to) - dayNumber(v.from) <= 62 * DAY,
  );

export const updateParams = z.object({ id: z.uuid() });

export const updateBody = z.union([slotBody, z.strictObject({ active: z.literal(false) })]);

export const removeParams = z.object({
  id: z.union([
    z.uuid(),
    z
      .string()
      .regex(
        /^auto:[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}:(10|1[2-9]|2[0-3])$/,
      ),
  ]),
});

export const listTrialsQuery = pagination;

export const requestTrialBody = z.strictObject({
  slotId: z.union([
    z.uuid(),
    z
      .string()
      .regex(
        /^auto:[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}:(10|1[2-9]|2[0-3])$/,
      ),
  ]),
});

export const reviewTrialParams = z.object({ id: z.uuid() });

export const reviewTrialBody = z.strictObject({
  status: z.enum(["approved", "declined", "cancelled"]),
});
