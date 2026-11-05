import type { PrismaClient } from "./generated/prisma/client";
import type { ReceiptStorage } from "./receipt-storage";

export const RECEIPT_CLEANUP_GRACE_MS = 24 * 60 * 60 * 1000;
const intervalMs = 15 * 60 * 1000;
const finalKeyPattern = /^receipts\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function cleanupReceipts(
  db: PrismaClient,
  storage: Pick<ReceiptStorage, "remove">,
  options: { dryRun?: boolean; now?: Date; limit?: number; stopping?: () => boolean } = {},
) {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? true;
  const limit = options.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Cleanup batch limit must be 1–100");
  const summary = { dryRun, examined: 0, eligible: 0, deletedObjects: 0, prunedUploads: 0, protected: 0, skipped: 0, failed: 0 };
  const jobs = await db.receiptCleanup.findMany({ where: { nextAttemptAt: { lte: now } }, orderBy: [{ nextAttemptAt: "asc" }, { objectKey: "asc" }], take: limit });
  for (const candidate of jobs) {
    if (options.stopping?.()) break;
    summary.examined++;
    try {
      const result = await db.$transaction(async tx => {
        // Submission takes this same row lock before finalizing or committing a
        // payment. Another worker skips it instead of waiting on storage I/O.
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM payment_uploads WHERE id = ${candidate.uploadId}::uuid FOR UPDATE SKIP LOCKED`;
        if (!locked.length) return { outcome: "skipped" as const, pruned: 0 };
        const job = await tx.receiptCleanup.findUnique({ where: { objectKey: candidate.objectKey }, include: { upload: true } });
        if (!job || job.nextAttemptAt > now) return { outcome: "skipped" as const, pruned: 0 };
        const { upload } = job;
        const safeKey = job.kind === "staging"
          ? job.objectKey === `staging/${upload.studentId}/${upload.id}`
          : job.kind === "final" && finalKeyPattern.test(job.objectKey);
        if (!safeKey) throw new Error("Invalid cleanup key");
        const eligibleAt = job.kind === "staging" ? +upload.expiresAt + RECEIPT_CLEANUP_GRACE_MS : Math.max(+job.createdAt + RECEIPT_CLEANUP_GRACE_MS, +upload.expiresAt);
        if (+now < eligibleAt) {
          if (!dryRun) await tx.receiptCleanup.update({ where: { objectKey: job.objectKey }, data: { nextAttemptAt: new Date(eligibleAt) } });
          return { outcome: "skipped" as const, pruned: 0 };
        }
        // Do not filter by status: pending, approved, cancelled and legacy
        // payments all retain their final receipt. Legacy URLs get a conservative
        // match on the unique final filename, including encoded paths.
        const referenced = await tx.payment.findFirst({ where: { OR: [
          { receiptKey: job.objectKey },
          { receiptUrl: { contains: job.objectKey.split("/").at(-1)! } },
        ] }, select: { id: true } });
        if (referenced) {
          if (!dryRun) await tx.receiptCleanup.delete({ where: { objectKey: job.objectKey } });
          return { outcome: "protected" as const, pruned: 0 };
        }
        if (dryRun) return { outcome: "eligible" as const, pruned: 0 };
        // Deleting an absent object is harmless (including after a crash between
        // storage deletion and database commit). Retain jobs when deletion fails.
        await storage.remove(job.objectKey);
        await tx.receiptCleanup.delete({ where: { objectKey: job.objectKey } });
        const pruned = await tx.paymentUpload.deleteMany({ where: { id: upload.id, expiresAt: { lte: now }, payment: { is: null }, cleanupJobs: { none: {} } } });
        return { outcome: "eligible" as const, pruned: pruned.count };
      }, { timeout: 30_000, maxWait: 5_000, isolationLevel: "ReadCommitted" });
      summary[result.outcome]++;
      if (result.outcome === "eligible" && !dryRun) { summary.deletedObjects++; summary.prunedUploads += result.pruned; }
    } catch {
      summary.failed++;
      if (!dryRun) {
        // Never log storage errors, object keys, signed URLs or credentials.
        await db.receiptCleanup.updateMany({ where: { objectKey: candidate.objectKey }, data: {
          attempts: { increment: 1 }, lastError: "cleanup_failed",
          nextAttemptAt: new Date(+now + Math.min(RECEIPT_CLEANUP_GRACE_MS, intervalMs * 2 ** Math.min(candidate.attempts, 7))),
        } }).catch(() => {});
      }
    }
  }
  return summary;
}

export function startReceiptCleanup(db: PrismaClient, storage: ReceiptStorage) {
  let stopping = false;
  let running: Promise<void> | undefined;
  const tick = () => {
    if (stopping || running) return;
    running = cleanupReceipts(db, storage, { dryRun: false, stopping: () => stopping })
      .then(result => { if (result.examined) console.info("Receipt cleanup", result); })
      .catch(() => { console.error("Receipt cleanup unavailable; check database migrations and storage configuration. Will retry."); })
      .finally(() => { running = undefined; });
  };
  const timer = setInterval(tick, intervalMs);
  tick();
  return async () => { stopping = true; clearInterval(timer); await running; };
}
