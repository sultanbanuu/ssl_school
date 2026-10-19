import { hashPassword } from "better-auth/crypto";
import type { PrismaClient } from "./generated/prisma/client";
import { accountInput } from "./contracts";

// Call only from the operator CLI or staff-authorized routes with a fixed role.
export async function provisionAccount(db: PrismaClient, input: unknown) {
  const data = accountInput.parse(input);
  const password = await hashPassword(data.password);
  const id = crypto.randomUUID();
  return db.$transaction(async (tx) => {
    await tx.user.create({ data: {
      id, email: data.email, name: [data.firstName, data.lastName].filter(Boolean).join(" "),
      accounts: { create: { providerId: "credential", accountId: id, password } },
    } });
    return tx.profile.create({ data: {
      id, firstName: data.firstName, lastName: data.lastName, role: data.role,
      ...(data.role === "student" ? { student: { create: {} } } : {}),
      ...(data.role === "teacher" ? { teacher: { create: { specialization: data.specialization! } } } : {}),
      ...(data.role === "admin" ? { admin: { create: {} } } : {}),
      ...(data.role === "manager" ? { manager: { create: {} } } : {}),
    }, select: { id: true, role: true, student: { select: { id: true } }, teacher: { select: { id: true } } } });
  });
}
