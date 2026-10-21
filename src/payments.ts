import { Elysia } from "elysia";
import { z } from "zod";
import type { Payment, PrismaClient, Prisma } from "./generated/prisma/client";
import { HttpError, type Actor } from "./authorization";
import { pagination } from "./contracts";
import { MAX_RECEIPT_SIZE, type ReceiptStorage } from "./receipt-storage";

const idParams = z.object({ id: z.uuid() });
const uploadBody = z.strictObject({ courseId: z.uuid(), contentType: z.enum(["image/jpeg", "image/png", "image/webp"]), size: z.number().int().positive().max(MAX_RECEIPT_SIZE) });
const submitBody = z.strictObject({ uploadId: z.uuid() });
const reviewBody = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("approved"), startDate: z.iso.date() }),
  z.strictObject({ status: z.literal("cancelled"), cancellationReason: z.string().trim().min(1).max(1000).optional() }),
]);
function requireAdmin(actor: Actor) {
  if (actor.role !== "admin") throw new HttpError(403, "Admin access required");
}
function requireStudent(actor: Actor): string {
  if (actor.role !== "student" || !actor.studentId) throw new HttpError(403, "Student access required");
  return actor.studentId;
}
function scope(actor: Actor): Prisma.PaymentWhereInput {
  if (actor.role === "admin") return {};
  return { studentId: requireStudent(actor) };
}
export function addCalendarMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}
function serialize(payment: Payment, actor?: Actor) {
  return { id: payment.id, studentId: payment.studentId, courseId: payment.courseId,
    courseName: payment.courseName, amount: payment.amount.toFixed(2), status: payment.status,
    submittedAt: payment.submittedAt, startDate: payment.startDate?.toISOString().slice(0, 10) ?? null,
    endDate: payment.endDate?.toISOString().slice(0, 10) ?? null,
    reviewedAt: payment.reviewedAt, reviewedBy: payment.reviewedBy, cancellationReason: payment.cancellationReason,
    receiptAvailable: !!payment.receiptKey,
    availableActions: actor?.role === "admin" && payment.status === "pending" && payment.receiptKey ? ["approve", "cancel"] : [] };
}

export function paymentRoutes(db: PrismaClient, actorFor: (request: Request) => Promise<Actor>, receipts?: ReceiptStorage) {
  function storage() {
    if (!receipts) throw new HttpError(503, "Receipt storage is not configured");
    return receipts;
  }
  async function eligible(client: Prisma.TransactionClient, studentId: string, courseId: string) {
    const enrollment = await client.enrollment.findFirst({ where: { studentId, courseId, student: { status: "active" }, course: { active: true } }, include: { course: true } });
    if (!enrollment) throw new HttpError(422, "Select one of your active enrolled courses");
    return enrollment;
  }
  return new Elysia()
    .get("/api/payments/courses", async ({ request, query }) => {
      const studentId = requireStudent(await actorFor(request));
      const records = await db.enrollment.findMany({ where: { studentId, student: { status: "active" }, course: { active: true } },
        include: { course: true }, orderBy: { id: "asc" }, take: query.limit, skip: query.offset });
      return records.map(({ course }) => ({ courseId: course.id, name: course.name, monthlyPrice: course.price.toFixed(2) }));
    }, { query: pagination })
    .post("/api/payments/uploads", async ({ request, body, set }) => {
      const studentId = requireStudent(await actorFor(request));
      const store = storage();
      const upload = await db.$transaction(async (tx) => {
        const enrollment = await eligible(tx, studentId, body.courseId);
        // Serialize upload-intent creation for this student to enforce a small quota.
        await tx.$queryRaw`SELECT id FROM students WHERE id = ${studentId}::uuid FOR UPDATE`;
        const recent = await tx.paymentUpload.count({ where: { studentId, createdAt: { gte: new Date(Date.now() - 3600000) } } });
        if (recent >= 10) throw new HttpError(429, "Too many receipt uploads; try again later");
        if (await tx.payment.findFirst({ where: { studentId, courseId: body.courseId, status: "pending", receiptKey: { not: null } } })) {
          throw new HttpError(409, "This course already has a pending payment");
        }
        const id = crypto.randomUUID();
        return tx.paymentUpload.create({ data: { id, studentId, courseId: body.courseId,
          objectKey: `staging/${studentId}/${id}`, contentType: body.contentType, size: body.size,
          amount: enrollment.course.price, courseName: enrollment.course.name, expiresAt: new Date(Date.now() + 15 * 60000) } });
      });
      const uploadUrl = await store.uploadUrl(upload.objectKey, upload.contentType);
      set.status = 201;
      return { uploadId: upload.id, uploadUrl, method: "PUT", headers: { "Content-Type": upload.contentType },
        uploadUrlExpiresInSeconds: 300, submitBefore: upload.expiresAt, amount: upload.amount.toFixed(2), courseName: upload.courseName };
    }, { body: uploadBody })
    .post("/api/payments", async ({ request, body, set }) => {
      const studentId = requireStudent(await actorFor(request));
      const upload = await db.paymentUpload.findFirst({ where: { id: body.uploadId, studentId } });
      if (!upload) throw new HttpError(404, "Upload not found");
      const existing = await db.payment.findUnique({ where: { uploadId: upload.id } });
      if (existing) return serialize(existing);
      if (upload.expiresAt <= new Date()) throw new HttpError(422, "Upload expired; start a new upload");
      await eligible(db, studentId, upload.courseId);
      const store = storage();
      const receiptKey = await store.finalize(upload.objectKey, upload.contentType, upload.size);
      let result: Payment;
      try {
        result = await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM payment_uploads WHERE id = ${upload.id}::uuid FOR UPDATE`;
          const previous = await tx.payment.findUnique({ where: { uploadId: upload.id } });
          if (previous) return previous;
          if (upload.expiresAt <= new Date()) throw new HttpError(422, "Upload expired; start a new upload");
          await eligible(tx, studentId, upload.courseId);
          return tx.payment.create({ data: { studentId, courseId: upload.courseId, amount: upload.amount, status: "pending",
            courseName: upload.courseName, uploadId: upload.id, receiptKey, submittedAt: new Date() } });
        });
      } catch (error) {
        await store.remove(receiptKey).catch(() => {});
        throw error;
      }
      if (result.receiptKey !== receiptKey) await store.remove(receiptKey).catch(() => {});
      // Staging objects expire through the bucket lifecycle, allowing concurrent retries.
      set.status = result.receiptKey === receiptKey ? 201 : 200;
      return serialize(result);
    }, { body: submitBody })
    .get("/api/payments", async ({ request, query, set }) => {
      const actor = await actorFor(request);
      const where = scope(actor);
      if (actor.role === "student") where.submittedAt = { gte: addCalendarMonths(new Date(), -6) };
      if (query.status) where.status = query.status;
      const records = await db.payment.findMany({ where, orderBy: [{ submittedAt: { sort: "desc", nulls: "last" } }, { id: "asc" }], take: query.limit, skip: query.offset });
      set.headers["Cache-Control"] = "private, no-store";
      return records.map((payment) => serialize(payment, actor));
    }, { query: pagination.extend({ status: z.enum(["pending", "approved", "cancelled"]).optional() }) })
    .get("/api/payments/:id", async ({ request, params, set }) => {
      const actor = await actorFor(request);
      const payment = await db.payment.findFirst({ where: { AND: [{ id: params.id }, scope(actor)] } });
      if (!payment) throw new HttpError(404, "Payment not found");
      set.headers["Cache-Control"] = "private, no-store";
      return serialize(payment, actor);
    }, { params: idParams })
    .get("/api/payments/:id/receipt", async ({ request, params, set }) => {
      const actor = await actorFor(request);
      const payment = await db.payment.findFirst({ where: { AND: [{ id: params.id }, scope(actor)] } });
      if (!payment?.receiptKey) throw new HttpError(404, "Receipt not found");
      set.headers["Cache-Control"] = "private, no-store";
      return { url: await storage().viewUrl(payment.receiptKey), expiresInSeconds: 300 };
    }, { params: idParams })
    .patch("/api/payments/:id/review", async ({ request, params, body }) => {
      const actor = await actorFor(request);
      requireAdmin(actor);
      const payment = await db.$transaction(async (tx) => {
        const current = await tx.payment.findUnique({ where: { id: params.id } });
        if (!current) throw new HttpError(404, "Payment not found");
        if (!current.receiptKey) throw new HttpError(409, "Legacy payment requires manual reconciliation");
        // All reviews for one enrollment share this lock, including different payments.
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM enrollments WHERE student_id = ${current.studentId}::uuid AND course_id = ${current.courseId}::uuid FOR UPDATE`;
        if (!locked.length) throw new HttpError(409, "Enrollment no longer exists");
        const startDate = body.status === "approved" ? new Date(`${body.startDate}T00:00:00.000Z`) : null;
        const endDate = startDate ? addCalendarMonths(startDate, 1) : null;
        if (startDate && endDate && await tx.payment.findFirst({ where: {
          studentId: current.studentId, courseId: current.courseId, status: "approved", id: { not: current.id },
          startDate: { lt: endDate }, endDate: { gt: startDate },
        } })) throw new HttpError(409, "Subscription period overlaps an approved payment");
        const updated = await tx.payment.updateMany({ where: { id: current.id, status: "pending" }, data: {
          status: body.status, startDate, endDate, reviewedAt: new Date(), reviewedBy: actor.id,
          cancellationReason: body.status === "cancelled" ? body.cancellationReason ?? null : null,
        } });
        if (updated.count !== 1) throw new HttpError(409, "Payment has already been reviewed");
        return tx.payment.findUniqueOrThrow({ where: { id: current.id } });
      });
      return serialize(payment, actor);
    }, { params: idParams, body: reviewBody });
}
