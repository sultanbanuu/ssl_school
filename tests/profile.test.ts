import { expect, test } from "bun:test";
import { createProfileService } from "../src/modules/profile/service";
import type { PrismaClient } from "../src/generated/prisma/client";
import type { Actor } from "../src/shared/authorization";
const data = { firstName: "Ada", lastName: "Lovelace", email: "ada@gmail.com", phone: "+994501234567" };
function fixture() {
  const writes: any[] = [];
  const db: any = { user: { findUniqueOrThrow: async () => ({ email: "old@gmail.com" }), update: async (args: any) => { writes.push(args); } }, profile: { update: async (args: any) => { writes.push(args); return { id: "self", ...args.data }; } } };
  db.$transaction = async (fn: any) => fn(db);
  return { writes, service: createProfileService(db as PrismaClient) };
}
test("account update persists identity and profile only for the signed-in student", async () => {
  const { service, writes } = fixture();
  const saved = await service.update({ id: "self", role: "student" } as Actor, data);
  expect(saved).toMatchObject({ id: "self", ...data });
  expect(writes).toHaveLength(2);
  for (const write of writes) expect(write.where).toEqual({ id: "self" });
  expect(writes[0].data).toMatchObject({ name: "Ada Lovelace", emailVerified: false });
  expect(writes[1].data).not.toHaveProperty("email");
});
test("nonstudents cannot use student account update", async () => {
  const { service, writes } = fixture();
  await expect(service.update({ id: "self", role: "teacher" } as Actor, data)).rejects.toThrow("Student access required");
  expect(writes).toHaveLength(0);
});
