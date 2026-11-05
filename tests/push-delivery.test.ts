import { describe, expect, test } from "bun:test";
import type { PrismaClient } from "../src/generated/prisma/client";
import { deliverPushNotifications } from "../src/push-delivery";
import { createNotificationService } from "../src/modules/notifications/service";
import type { Actor } from "../src/shared/authorization";
import { deviceBody } from "../src/modules/notifications/schemas";

const student: Actor = { id: "student", role: "student", studentId: null, teacherId: null };
const token = "ExpoPushToken[test_token]";
function fixture(overrides: Record<string, unknown> = {}, claimed = true) {
  const writes: any[] = [];
  const removed: any[] = [];
  const row = { id: "job", notificationId: "message", token, status: "pending", attempts: 0, ticketId: null, nextAttemptAt: new Date(0), notification: { userId: "student", title: "Update", message: "🙂".repeat(5000) }, device: { userId: "student", profile: { role: "student" } }, ...overrides };
  const db = {
    pushDelivery: { findMany: async () => [row], updateMany: async (args: any) => { writes.push(args); return { count: claimed ? 1 : 0 }; } },
    pushDevice: { deleteMany: async (args: any) => { removed.push(args); return { count: 1 }; } },
  } as unknown as PrismaClient;
  return { db, writes, removed };
}
describe("Device push delivery", () => {
  test("queues a bounded payload and checks its receipt later", async () => {
    const { db, writes } = fixture();
    let payload: any;
    await deliverPushNotifications(db, async (url, init) => {
      expect(url).toEndWith("/send"); payload = JSON.parse(String(init.body));
      return Response.json({ data: [{ status: "ok", id: "ticket" }] });
    }, new Date(0));
    expect(Array.from(payload[0].body)).toHaveLength(500);
    expect(payload[0].data).toEqual({ userId: "student", notificationId: "message", screen: "notifications" });
    expect(writes.at(-1).data).toMatchObject({ status: "receipt", ticketId: "ticket", attempts: 0, nextAttemptAt: new Date(900000) });
  });
  test("records successful receipts", async () => {
    const { db, writes } = fixture({ status: "receipt", ticketId: "ticket" });
    await deliverPushNotifications(db, async (url, init) => {
      expect(url).toEndWith("/getReceipts"); expect(JSON.parse(String(init.body))).toEqual({ ids: ["ticket"] });
      return Response.json({ data: { ticket: { status: "ok" } } });
    });
    expect(writes.at(-1).data.status).toBe("delivered");
  });
  for (const receipt of [false, true]) test(`removes invalid tokens from ${receipt ? "receipts" : "tickets"}`, async () => {
    const { db, removed } = fixture(receipt ? { status: "receipt", ticketId: "ticket" } : {});
    const error = { status: "error", details: { error: "DeviceNotRegistered" } };
    await deliverPushNotifications(db, async () => Response.json({ data: receipt ? { ticket: error } : [error] }));
    expect(removed).toEqual([{ where: { token, userId: "student" } }]);
  });
  test("retries outages with backoff and caps attempts", async () => {
    for (const attempts of [0, 7]) {
      const { db, writes } = fixture({ attempts });
      await deliverPushNotifications(db, async () => { throw new Error("Offline"); }, new Date(0));
      expect(writes.at(-1).data.status).toBe(attempts ? "failed" : "pending");
      expect(writes.at(-1).data.nextAttemptAt.getTime()).toBeGreaterThan(0);
    }
  });
  test("does not send a job claimed by another worker", async () => {
    const { db } = fixture({}, false);
    await deliverPushNotifications(db, async () => { throw new Error("Must not call provider"); });
  });
  test("cancels delivery after account transfer or role change", async () => {
    for (const device of [{ userId: "other", profile: { role: "student" } }, { userId: "student", profile: { role: "admin" } }]) {
      const { db, writes } = fixture({ device });
      await deliverPushNotifications(db, async () => { throw new Error("Must not call provider"); });
      expect(writes.at(-1).data.status).toBe("cancelled");
    }
  });
});

describe("Push device ownership", () => {
  test("only students can register and removal is scoped to the current account", async () => {
    const { db, removed } = fixture();
    const service = createNotificationService(db);
    for (const role of ["admin", "manager", "teacher"] as const) {
      await expect(service.registerDevice({ ...student, role }, token)).rejects.toMatchObject({ status: 403 });
    }
    await service.removeDevice(student, token);
    expect(removed).toEqual([{ where: { token, userId: student.id } }]);
  });
  test("transfers a token transactionally, deleting old queued deliveries through cascade", async () => {
    const { db, removed } = fixture();
    let upsert: any;
    (db as any).$transaction = async (work: any) => work(db);
    (db.pushDevice as any).upsert = async (args: any) => { upsert = args; };
    await createNotificationService(db).registerDevice(student, token);
    expect(removed).toEqual([{ where: { token, userId: { not: student.id } } }]);
    expect(upsert.create).toEqual({ token, userId: student.id });
  });
  test("rejects arbitrary endpoints and extra ownership fields", () => {
    expect(deviceBody.safeParse({ token }).success).toBe(true);
    expect(deviceBody.safeParse({ token: "https://example.com" }).success).toBe(false);
    expect(deviceBody.safeParse({ token, userId: "someone-else" }).success).toBe(false);
  });
  test("announcement and device deliveries are written in one transaction", async () => {
    const events: string[] = [];
    let jobs: any;
    const db = {
      profile: { findUnique: async () => ({ id: student.id, role: "student" }) },
      $transaction: async (work: any) => {
        events.push("begin");
        const result = await work({
          notification: { create: async () => { events.push("inbox"); return { id: "notice" }; } },
          pushDevice: { findMany: async () => [{ token }] },
          pushDelivery: { createMany: async (args: any) => { events.push("push"); jobs = args.data; } },
        });
        events.push("commit"); return result;
      },
    } as unknown as PrismaClient;
    await createNotificationService(db).send({ ...student, role: "admin" }, { userId: student.id, title: "Title", message: "Message" });
    expect(events).toEqual(["begin", "inbox", "push", "commit"]);
    expect(jobs).toEqual([{ notificationId: "notice", token }]);
  });
});
