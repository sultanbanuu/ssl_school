import { expect, test } from "bun:test";
import { cleanupReceipts, RECEIPT_CLEANUP_GRACE_MS as grace } from "../src/receipt-cleanup";
import type { PrismaClient } from "../src/generated/prisma/client";

function fixture(kind = "staging") {
  const now = new Date("2026-11-04T12:00:00Z");
  const upload = { id: crypto.randomUUID(), studentId: crypto.randomUUID(), expiresAt: new Date(+now - grace - 1000) };
  const job = { objectKey: kind === "staging" ? `staging/${upload.studentId}/${upload.id}` : `receipts/${crypto.randomUUID()}`, uploadId: upload.id, kind, createdAt: new Date(+now - grace - 1000), nextAttemptAt: new Date(+now - 1000), attempts: 0, upload };
  const state = { job: true, upload: true, referenced: false, submitted: false, locked: false, fail: false, retries: 0 };
  const removed: string[] = [];
  const db: any = {
    receiptCleanup: {
      findMany: async () => [job], findUnique: async () => state.job ? job : null,
      delete: async () => { state.job = false; },
      update: async ({ data }: any) => Object.assign(job, data),
      updateMany: async ({ data }: any) => { state.retries++; job.nextAttemptAt = data.nextAttemptAt; },
    },
    payment: { findFirst: async () => state.referenced ? { id: "payment" } : null },
    paymentUpload: { deleteMany: async () => { if (state.submitted || state.job) return { count: 0 }; state.upload = false; return { count: 1 }; } },
    $queryRaw: async () => state.locked ? [] : [{ id: upload.id }],
    $transaction: async (fn: any) => fn(db),
  };
  const storage = { remove: async (key: string) => { if (state.fail) throw new Error("storage unavailable"); removed.push(key); } };
  return { state, job, removed, run: (dryRun = false) => cleanupReceipts(db as PrismaClient, storage, { now, dryRun }) };
}

test("preview does not delete objects or mutate queue/upload metadata", async () => {
  const f = fixture(); expect(await f.run(true)).toMatchObject({ eligible: 1, deletedObjects: 0 });
  expect(f.removed).toEqual([]); expect(f.state.job && f.state.upload).toBe(true);
});
test("expired abandoned staging upload is deleted and metadata pruned", async () => {
  const f = fixture(); expect(await f.run()).toMatchObject({ deletedObjects: 1, prunedUploads: 1 });
  expect(f.removed).toEqual([f.job.objectKey]); expect(f.state.upload).toBe(false);
});
test("submitted staging copy is cleaned but idempotency metadata retained", async () => {
  const f = fixture(); f.state.submitted = true;
  expect(await f.run()).toMatchObject({ deletedObjects: 1, prunedUploads: 0 }); expect(f.state.upload).toBe(true);
});
test("referenced final receipt is protected regardless of payment status", async () => {
  const f = fixture("final"); f.state.referenced = true; f.state.submitted = true;
  expect(await f.run()).toMatchObject({ protected: 1, deletedObjects: 0 }); expect(f.removed).toEqual([]);
});
test("failed final copy becomes eligible after grace", async () => {
  const f = fixture("final"); expect(await f.run()).toMatchObject({ deletedObjects: 1 });
});
test("storage failure retains upload and queue and schedules retry", async () => {
  const f = fixture(); f.state.fail = true;
  expect(await f.run()).toMatchObject({ failed: 1, prunedUploads: 0 });
  expect(f.state.job && f.state.upload).toBe(true); expect(f.state.retries).toBe(1);
});
test("submission lock causes cleanup to skip without deleting", async () => {
  const f = fixture(); f.state.locked = true;
  expect(await f.run()).toMatchObject({ skipped: 1 }); expect(f.removed).toEqual([]);
});
test("premature job and malformed key cannot delete storage", async () => {
  const f = fixture(); f.job.upload.expiresAt = new Date("2026-11-04T11:00:00Z");
  expect(await f.run()).toMatchObject({ skipped: 1 }); expect(f.removed).toEqual([]);
  const unsafe = fixture(); unsafe.job.objectKey = "receipts/foreign";
  expect(await unsafe.run()).toMatchObject({ failed: 1 }); expect(unsafe.removed).toEqual([]);
});
