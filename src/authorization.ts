import type { Role } from "./generated/prisma/enums";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Actor = {
  id: string;
  role: Role;
  studentId: string | null;
  teacherId: string | null;
};
export function requireStaff(actor: Actor) {
  if (actor.role !== "admin" && actor.role !== "manager")
    throw new HttpError(403, "Staff access required");
}
export function courseScope(actor: Actor) {
  if (actor.role === "student") return { active: true };
  if (actor.role === "teacher") {
    if (!actor.teacherId)
      throw new HttpError(403, "Teacher account is incomplete");
    return { teacherId: actor.teacherId };
  }
  return {};
}
export function enrollmentScope(actor: Actor) {
  if (actor.role === "student") {
    if (!actor.studentId)
      throw new HttpError(403, "Student account is incomplete");
    return { studentId: actor.studentId };
  }
  if (actor.role === "teacher") {
    if (!actor.teacherId)
      throw new HttpError(403, "Teacher account is incomplete");
    return { teacherId: actor.teacherId };
  }
  return {};
}
