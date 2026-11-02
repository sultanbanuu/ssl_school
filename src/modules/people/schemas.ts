import { z } from "zod";
import { pagination } from "../../shared/pagination";

export const identity = {
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80),
};

export const credentials = {
  email: z.email().transform((v) => v.toLowerCase()),
  password: z.string().min(12).max(128),
  firstName: identity.firstName,
  lastName: identity.lastName.optional(),
};

export const profileFields = {
  ...identity,
  phone: z.string().trim().max(40).nullable(),
};

export const studentPatch = z
  .strictObject({
    ...profileFields,
    englishLevel: z.string().trim().max(80).nullable(),
    learningGoal: z.string().trim().max(2000).nullable(),
    status: z.enum(["active", "inactive"]),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Supply at least one field");

export const teacherPatch = z
  .strictObject({
    ...profileFields,
    specialization: z.string().trim().min(1).max(200),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Supply at least one field");

export const idParams = z.object({ id: z.uuid() });

export const schedulingStudentsQuery = pagination;

export const listStudentsQuery = pagination;

export const createStudentBody = z.strictObject(credentials);

export const listTeachersQuery = pagination;

export const createTeacherBody = z.strictObject({
  ...credentials,
  specialization: z.string().trim().min(1).max(200),
});
