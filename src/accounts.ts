import { hashPassword } from "better-auth/crypto";
import type { PrismaClient } from "./generated/prisma/client";
import { accountInput } from "./contracts";
import { z } from "zod";

const passwordResetInput = z.strictObject({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
});

// Operator-only recovery. Password replacement and session revocation commit together.
export async function resetAccountPassword(db: PrismaClient, input: unknown) {
  const data = passwordResetInput.parse(input);
  const password = await hashPassword(data.password);
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { email: data.email }, select: { id: true } });
    if (!user) throw new Error("Account not found");
    const updated = await tx.account.updateMany({
      where: { userId: user.id, providerId: "credential" },
      data: { password },
    });
    if (updated.count !== 1) throw new Error("Account must have exactly one password credential");
    const revoked = await tx.session.deleteMany({ where: { userId: user.id } });
    return { id: user.id, revokedSessions: revoked.count };
  });
}

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
