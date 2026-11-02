import { Elysia } from "elysia";
import type { PrismaClient } from "../../generated/prisma/client";
import type { ReceiptStorage } from "../../receipt-storage";
import type { Actor } from "../../shared/authorization";
import {
  coursesQuery,
  createUploadBody,
  idParams,
  listQuery,
  reviewBody,
  submitBody,
} from "./schemas";
import { createPaymentService } from "./service";

export function paymentRoutes(
  db: PrismaClient,
  actorFor: (request: Request) => Promise<Actor>,
  receipts?: ReceiptStorage,
) {
  const service = createPaymentService(db, receipts);
  return new Elysia()
    .get(
      "/api/payments/courses",
      async ({ request, query }) => {
        return service.courses(await actorFor(request), query);
      },
      { query: coursesQuery },
    )
    .post(
      "/api/payments/uploads",
      async ({ request, body, set }) => {
        const result = await service.createUpload(await actorFor(request), body);
        set.status = 201;
        return result;
      },
      { body: createUploadBody },
    )
    .post(
      "/api/payments",
      async ({ request, body, set }) => {
        const result = await service.submit(await actorFor(request), body);
        set.status = result.created ? 201 : 200;
        return result.payment;
      },
      { body: submitBody },
    )
    .get(
      "/api/payments",
      async ({ request, query, set }) => {
        const result = await service.list(await actorFor(request), query);
        set.headers["Cache-Control"] = "private, no-store";
        return result;
      },
      { query: listQuery },
    )
    .get(
      "/api/payments/:id",
      async ({ request, params, set }) => {
        const result = await service.get(await actorFor(request), params);
        set.headers["Cache-Control"] = "private, no-store";
        return result;
      },
      { params: idParams },
    )
    .get(
      "/api/payments/:id/receipt",
      async ({ request, params, set }) => {
        const result = await service.receipt(await actorFor(request), params);
        set.headers["Cache-Control"] = "private, no-store";
        return result;
      },
      { params: idParams },
    )
    .patch(
      "/api/payments/:id/review",
      async ({ request, params, body }) => {
        return service.review(await actorFor(request), params, body);
      },
      { params: idParams, body: reviewBody },
    );
}
