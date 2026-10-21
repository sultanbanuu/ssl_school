import { expect, test } from "bun:test";
import { createApp } from "../src/app";
import type { PrismaClient } from "../src/generated/prisma/client";
import type { Role } from "../src/generated/prisma/enums";

const actorId = "11111111-1111-4111-8111-111111111111";
const targetId = "22222222-2222-4222-8222-222222222222";
function setup(role: Role | null, changed = 1) {
  const calls: { name: string; args: any }[] = [];
  const capture = (name: string, result: unknown) => async (args: any) => {
    calls.push({ name, args }); return result;
  };
  const tx = {
    profile: {
      findUnique: capture("target", { id: targetId, role: "student" }),
      updateMany: capture("promote", { count: changed }),
    },
    teacher: { create: capture("teacher", {}) },
    manager: { create: capture("manager", {}) },
    session: { deleteMany: capture("revoke", { count: 1 }) },
  };
  const db = {
    profile: { findUnique: async () => ({ id: actorId, role }) },
    $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaClient;
  const app = createApp({ db, origins: [], getSession: async () => role ? { user: { id: actorId } } : null, authHandler: async () => new Response() }).compile();
  const promote = (body: unknown) => app.handle(new Request(`http://localhost/api/users/${targetId}/role`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  return { calls, promote };
}

test("only admins can promote accounts, with no writes for other roles", async () => {
  for (const role of [null, "student", "teacher", "manager"] as const) {
    const f = setup(role);
    expect((await f.promote({ role: "manager" })).status).toBe(role ? 403 : 401);
    expect(f.calls).toHaveLength(0);
  }
});

test("promotion creates the fixed role and revokes only the target user's sessions", async () => {
  for (const role of ["teacher", "manager"] as const) {
    const f = setup("admin");
    const response = await f.promote({ role, ...(role === "teacher" ? { specialization: "English" } : {}) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: targetId, role });
    expect(f.calls.map(call => call.name)).toEqual(["target", "promote", role, "revoke"]);
    expect(f.calls[1].args).toEqual({ where: { id: targetId, role: "student" }, data: { role } });
    expect(f.calls[3].args).toEqual({ where: { userId: targetId } });
  }
});

test("invalid promotions cannot grant admin or inject extra fields", async () => {
  const f = setup("admin");
  for (const body of [{ role: "admin" }, { role: "teacher" }, { role: "manager", id: actorId }]) {
    expect((await f.promote(body)).status).toBe(422);
  }
  expect(f.calls).toHaveLength(0);
});

test("a concurrent or repeated promotion stops before creating a second role", async () => {
  const f = setup("admin", 0);
  expect((await f.promote({ role: "manager" })).status).toBe(409);
  expect(f.calls.map(call => call.name)).toEqual(["target", "promote"]);
});
