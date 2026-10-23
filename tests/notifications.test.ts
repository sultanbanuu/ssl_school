import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import type { PrismaClient } from "../src/generated/prisma/client";
import type { Role } from "../src/generated/prisma/enums";
const userId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
function fixture(role: Role | null, found = true) {
  const calls: { name: string; args: any }[] = [];
  const record = { id: otherId, userId, title: "Update", message: "Hello", isRead: false };
  const db = {
    profile: { findUnique: async (args: any) => args.select ? (found ? { id: otherId } : null) : { id: userId, role }, findMany: async (args: any) => { calls.push({ name: "recipients", args }); return args.where?.role === 'student' && found ? [{ id: userId }, { id: otherId }] : []; } },
    notification: {
      findMany: async (args: any) => { calls.push({ name: "list", args }); return [record]; },
      count: async (args: any) => { calls.push({ name: "count", args }); return 3; },
      updateMany: async (args: any) => { calls.push({ name: "update", args }); return { count: found ? 1 : 0 }; },
      create: async (args: any) => { calls.push({ name: "create", args }); return record; },
      createMany: async (args: any) => { calls.push({ name: "broadcast", args }); return { count: args.data.length }; },
    },
  } as unknown as PrismaClient;
  const app = createApp({ db, getSession: async () => role ? { user: { id: userId } } : null, authHandler: async () => new Response(), origins: [] }).compile();
  const call = (path = "", method = "GET", body?: unknown) => app.handle(new Request(`http://localhost/api/notifications${path}`, { method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) }));
  return { call, calls };
}
describe("Notifications", () => {
  for (const role of ['admin', 'manager'] as const) test(`${role} broadcasts only to student profiles`, async () => {
    const { call, calls } = fixture(role);
    const result = await call('', 'POST', { audience: 'all_students', title: ' Update ', message: ' Hello students ' });
    expect(result.status).toBe(201);
    expect(await result.json()).toEqual({ audience: 'all_students', delivered: 2 });
    expect(calls[0].args).toEqual({ where: { role: 'student' }, select: { id: true } });
    expect(calls[1].args.data).toEqual([userId, otherId].map(id => ({ userId: id, title: 'Update', message: 'Hello students', type: 'announcement' })));
  });
  for (const role of [null, 'student', 'teacher'] as const) test(`${role} cannot broadcast`, async () => {
    const { call, calls } = fixture(role);
    expect((await call('', 'POST', { audience: 'all_students', title: 'Update', message: 'Hello' })).status).toBe(role ? 403 : 401);
    expect(calls).toHaveLength(0);
  });
  test('broadcast rejects an empty audience and ambiguous targets', async () => {
    const { call, calls } = fixture('admin', false);
    expect((await call('', 'POST', { audience: 'all_students', title: 'Update', message: 'Hello' })).status).toBe(422);
    expect(calls.some(call => call.name === 'broadcast')).toBe(false);
    for (const body of [
      { audience: 'all_students', userId, title: 'Update', message: 'Hello' },
      { audience: 'all_staff', title: 'Update', message: 'Hello' },
      { audience: 'all_students', title: ' ', message: 'Hello' },
    ]) expect((await call('', 'POST', body)).status).toBe(422);
  });
  test("all endpoints require authentication", async () => {
    const { call, calls } = fixture(null);
    for (const [path, method, body] of [["", "GET"], ["/unread-count", "GET"], ["/recipients", "GET"], ["/read-all", "PATCH"], [`/${otherId}/read`, "PATCH"], ["", "POST", { userId: otherId, title: "Hi", message: "Hello" }]] as const) expect((await call(path, method, body)).status).toBe(401);
    expect(calls).toHaveLength(0);
  });
  for (const role of ["student", "teacher", "manager", "admin"] as const) {
    test(`${role} inbox and unread count are private`, async () => {
      const { call, calls } = fixture(role);
      const response = await call("?unread=true&limit=10&offset=2");
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(calls[0].args).toMatchObject({ where: { userId, isRead: false }, take: 10, skip: 2 });
      expect(await (await call("/unread-count")).json()).toEqual({ count: 3 });
      expect(calls[1].args.where).toEqual({ userId, isRead: false });
    });
  }
  test("mark read scopes by recipient and is idempotent", async () => {
    const { call, calls } = fixture("admin");
    expect((await call(`/${otherId}/read`, "PATCH")).status).toBe(200);
    expect((await call(`/${otherId}/read`, "PATCH")).status).toBe(200);
    expect(calls[0].args).toEqual({ where: { id: otherId, userId }, data: { isRead: true } });
  });
  test("foreign or absent notifications return 404", async () => {
    expect((await fixture("student", false).call(`/${otherId}/read`, "PATCH")).status).toBe(404);
  });
  test("mark all affects only own unread rows", async () => {
    const { call, calls } = fixture("teacher");
    expect((await call("/read-all", "PATCH")).status).toBe(200);
    expect(calls[0].args).toEqual({ where: { userId, isRead: false }, data: { isRead: true } });
  });
  for (const role of ["student", "teacher"] as const) test(`${role} cannot send or list recipients`, async () => {
    const { call, calls } = fixture(role);
    expect((await call("", "POST", { userId: otherId, title: "Hi", message: "Hello" })).status).toBe(403);
    expect((await call("/recipients")).status).toBe(403);
    expect(calls).toHaveLength(0);
  });
  for (const role of ["admin", "manager"] as const) test(`${role} can send validated announcements`, async () => {
    const { call, calls } = fixture(role);
    expect((await call("", "POST", { userId: otherId, title: " Hi ", message: " Hello " })).status).toBe(201);
    expect(calls[0].args.data).toEqual({ userId: otherId, title: "Hi", message: "Hello", type: "announcement" });
    expect((await call("/recipients")).status).toBe(200);
    expect(calls[1].args.select).toEqual({ id: true, firstName: true, lastName: true, role: true });
  });
  test("missing recipient and invalid inputs fail", async () => {
    const { call } = fixture("admin", false);
    expect((await call("", "POST", { userId: otherId, title: "Hi", message: "Hello" })).status).toBe(422);
    for (const body of [{ userId: "bad", title: "Hi", message: "Hello" }, { userId: otherId, title: " ", message: "Hello" }, { userId: otherId, title: "Hi", message: "Hello", isRead: true }]) expect((await call("", "POST", body)).status).toBe(422);
    expect((await call("?unread=1")).status).toBe(422);
    expect((await call("?limit=101")).status).toBe(422);
    expect((await call("/bad/read", "PATCH")).status).toBe(422);
  });
});
