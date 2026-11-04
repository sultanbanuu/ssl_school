import { expect, test } from "bun:test";
import { phoneSchema } from "../src/shared/phone";
import { createApp } from "../src/app";
import type { PrismaClient } from "../src/generated/prisma/client";
const id = "11111111-1111-4111-8111-111111111111";
function fixture(role: "student" | "teacher" | null) {
  const writes: any[] = [];
  const db: any = {
    profile: { findUnique: async () => ({ id, role, student: { id } }), update: async (args: any) => { writes.push(args); return { phone: args.data.phone }; } },
    user: { update: async (args: any) => { writes.push(args); return {}; } },
    $transaction: async (fn: any) => fn(db),
  };
  const app = createApp({ db: db as PrismaClient, origins: [], authHandler: async () => new Response(), getSession: async () => role ? { user: { id } } : null }).compile();
  const send = (body: unknown) => app.handle(new Request("http://localhost/api/me/phone", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  return { send, writes };
}
test("phone input normalizes formatting and requires a valid international number", () => {
  expect(phoneSchema.parse(" +994 (50) 123-45-67 ")).toBe("+994501234567");
  for (const phone of ["", "0501234567", "+123", "+0123456789", "+994hello", "+1234567890123456"]) expect(phoneSchema.safeParse(phone).success).toBe(false);
});
test("student phone update writes only the authenticated account and its profile", async () => {
  const f = fixture("student"), response = await f.send({ phone: "+994 (50) 123-45-67" });
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ phone: "+994501234567" });
  expect(f.writes).toHaveLength(2);
  for (const write of f.writes) { expect(write.where).toEqual({ id }); expect(write.data).toEqual({ phone: "+994501234567" }); }
});
test("phone updates reject unauthenticated requests, other roles, invalid numbers and target injection", async () => {
  for (const role of [null, "teacher"] as const) { const f = fixture(role); expect((await f.send({ phone: "+994501234567" })).status).toBe(role ? 403 : 401); expect(f.writes).toHaveLength(0); }
  for (const body of [{ phone: "bad" }, { phone: "+994501234567", id: "another-account" }]) { const f = fixture("student"); expect((await f.send(body)).status).toBe(422); expect(f.writes).toHaveLength(0); }
});
