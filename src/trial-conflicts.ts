import type { Prisma } from "./generated/prisma/client";
import { HttpError } from "./shared/authorization";

export async function checkTrialConflict(
  tx: Prisma.TransactionClient,
  teacherId: string,
  studentId: string | undefined,
  startsAt: Date,
  endsAt: Date,
  excluded?: string,
) {
  const conflict = await tx.trialRequest.findFirst({
    where: {
      status: { in: ["pending", "approved"] },
      ...(excluded ? { id: { not: excluded } } : {}),
      slot: { startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
      OR: [{ slot: { teacherId } }, ...(studentId ? [{ studentId }] : [])],
    },
  });
  if (conflict)
    throw new HttpError(
      409,
      "Teacher or student already has a trial at this time",
    );
}
