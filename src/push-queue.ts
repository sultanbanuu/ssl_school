import type { Prisma } from "./generated/prisma/client";

type Message = { userId: string; title: string; message: string; type: string };

/**
 * Creates inbox notifications and queues a device push for every registered
 * device of each recipient, inside the caller's transaction. Recipients who have
 * switched notifications off have no registered device, so they only get the inbox row.
 */
export async function notifyWithPush(tx: Prisma.TransactionClient, messages: Message[]) {
  if (!messages.length) return [];
  const rows = messages.map(message => ({ id: crypto.randomUUID(), ...message }));
  await tx.notification.createMany({ data: rows });
  const devices = await tx.pushDevice.findMany({ where: { userId: { in: [...new Set(rows.map(row => row.userId))] } } });
  const jobs = rows.flatMap(row => devices.filter(device => device.userId === row.userId).map(device => ({ notificationId: row.id, token: device.token })));
  if (jobs.length) await tx.pushDelivery.createMany({ data: jobs });
  return rows;
}
