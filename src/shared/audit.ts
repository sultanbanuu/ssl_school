import type { Prisma } from "../generated/prisma/client";
import type { Actor } from "./authorization";

// Always call inside the mutation's transaction. SET LOCAL prevents actor
// context from leaking to another request on a pooled connection.
export async function setAuditActor(tx: Prisma.TransactionClient, actor: Actor) {
  const context = JSON.stringify({ id: actor.id, role: actor.role });
  await tx.$queryRaw`SELECT set_config('school.audit_actor', ${context}, true)`;
}
