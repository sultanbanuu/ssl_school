import type { PrismaClient } from "./generated/prisma/client";

type Ticket = { status: "ok" | "error"; id?: string; details?: { error?: string } };
type PushFetch = (url: string, init: RequestInit) => Promise<Response>;

// Durable outbox: database writes succeed independently of the push provider.
export async function deliverPushNotifications(db: PrismaClient, fetcher: PushFetch = fetch, now = new Date()) {
  const rows = await db.pushDelivery.findMany({
    where: { status: { in: ["pending", "receipt"] }, nextAttemptAt: { lte: now } },
    include: { notification: true, device: { include: { profile: { select: { role: true } } } } },
    orderBy: { nextAttemptAt: "asc" }, take: 100,
  });
  for (const row of rows) {
    const claim = await db.pushDelivery.updateMany({
      where: { id: row.id, status: row.status, nextAttemptAt: row.nextAttemptAt },
      data: { nextAttemptAt: new Date(now.getTime() + 120_000), attempts: { increment: 1 } },
    });
    if (!claim.count) continue;
    const update = (data: { status?: string; ticketId?: string; nextAttemptAt?: Date; attempts?: number }) => db.pushDelivery.updateMany({ where: { id: row.id }, data });
    if (row.device.userId !== row.notification.userId || row.device.profile.role !== "student") {
      await update({ status: "cancelled" });
      continue;
    }
    try {
      const response = await fetcher(`https://exp.host/--/api/v2/push/${row.ticketId ? "getReceipts" : "send"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
        // Long messages remain in the inbox; keep the push payload below APNs/FCM limits.
        body: JSON.stringify(row.ticketId ? { ids: [row.ticketId] } : [{ to: row.token, title: row.notification.title, body: Array.from(row.notification.message).slice(0, 500).join(""), sound: "default", channelId: "school-updates", data: { screen: "notifications", userId: row.notification.userId, notificationId: row.notificationId } }]),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error("Push provider unavailable");
      const payload = await response.json() as { data?: Ticket[] | Record<string, Ticket> };
      const ticket = row.ticketId ? (payload.data as Record<string, Ticket> | undefined)?.[row.ticketId] : (payload.data as Ticket[] | undefined)?.[0];
      if (!ticket) throw new Error("Push receipt not available yet");
      if (ticket.status === "error") {
        if (ticket.details?.error === "DeviceNotRegistered") {
          await db.pushDevice.deleteMany({ where: { token: row.token, userId: row.notification.userId } });
        } else if (ticket.details?.error === "MessageRateExceeded") {
          await update({ status: row.attempts >= 7 ? "failed" : "pending", ticketId: "", nextAttemptAt: new Date(now.getTime() + 60_000 * 2 ** Math.min(row.attempts, 6)) });
        } else await update({ status: "failed" });
      } else if (row.ticketId) await update({ status: "delivered" });
      else if (ticket.id) await update({ status: "receipt", ticketId: ticket.id, attempts: 0, nextAttemptAt: new Date(now.getTime() + 15 * 60_000) });
      else throw new Error("Missing push ticket");
    } catch {
      await update({ status: row.attempts >= 7 ? "failed" : row.status, nextAttemptAt: new Date(now.getTime() + 60_000 * 2 ** Math.min(row.attempts, 6)) });
    }
  }
}

export function startPushDelivery(db: PrismaClient) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await deliverPushNotifications(db); }
    catch { console.error("Push queue unavailable. Check database connectivity and apply migrations."); }
    finally { running = false; }
  };
  void tick();
  const timer = setInterval(() => void tick(), 15_000);
  return () => clearInterval(timer);
}
