import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { addCalendarMonths } from "../src/payments";
import { isReceiptImage, type ReceiptStorage } from "../src/receipt-storage";
import { Prisma, type PrismaClient } from "../src/generated/prisma/client";
import type { Role } from "../src/generated/prisma/enums";

const studentId = "22222222-2222-4222-8222-222222222222";
const courseId = "44444444-4444-4444-8444-444444444444";
const id = "55555555-5555-4555-8555-555555555555";
const userId = "11111111-1111-4111-8111-111111111111";
function fixture(role: Role | null = "student") {
  const calls: { name: string; args: any }[] = [];
  const state = {
    eligible: true,
    overlap: false,
    payment: null as any,
    upload: null as any,
    updateCount: 1,
    role,
  };
  const record = (name: string, args: any) => calls.push({ name, args });
  const db: any = {
    profile: {
      findUnique: async () => ({
        id: userId,
        role: state.role,
        student: { id: studentId },
        teacher: null,
      }),
    },
    enrollment: {
      findFirst: async (args: any) => {
        record("eligible", args);
        return state.eligible
          ? { course: { name: "English", price: new Prisma.Decimal("50") } }
          : null;
      },
      findMany: async (args: any) => {
        record("courses", args);
        return [];
      },
    },
    paymentUpload: {
      count: async () => 0,
      create: async ({ data }: any) => {
        state.upload = data;
        return data;
      },
      findFirst: async ({ where }: any) =>
        state.upload?.studentId === where.studentId ? state.upload : null,
    },
    payment: {
      findUnique: async () => state.payment,
      findUniqueOrThrow: async () => state.payment,
      findFirst: async (args: any) => {
        record("findPayment", args);
        return args.where.status === "approved"
          ? state.overlap
            ? { id }
            : null
          : args.where.AND
            ? state.payment
            : null;
      },
      findMany: async (args: any) => {
        record("history", args);
        return state.payment ? [state.payment] : [];
      },
      create: async ({ data }: any) => {
        record("create", data);
        state.payment = {
          id,
          startDate: null,
          endDate: null,
          reviewedAt: null,
          reviewedBy: null,
          cancellationReason: null,
          ...data,
        };
        return state.payment;
      },
      updateMany: async (args: any) => {
        record("review", args);
        const count =
          state.payment?.status === args.where.status ? state.updateCount : 0;
        if (count) state.payment = { ...state.payment, ...args.data };
        return { count };
      },
    },
    $queryRaw: async () => [{ id }],
  };
  db.$transaction = async (fn: any) => fn(db);
  const receipts: ReceiptStorage = {
    uploadUrl: async () => "https://storage.example/upload",
    finalize: async (...args) => {
      record("finalize", args);
      return "receipts/immutable";
    },
    remove: async (key) => {
      record("remove", key);
    },
    viewUrl: async (key) => {
      record("view", key);
      return "https://storage.example/view";
    },
  };
  const app = createApp({
    db: db as PrismaClient,
    receipts,
    getSession: async () => (role ? { user: { id: userId } } : null),
    authHandler: async () => new Response(),
    origins: [],
  }).compile();
  const request = (path: string, body?: unknown, method = "POST") =>
    app.handle(
      new Request(
        `http://localhost${path}`,
        body === undefined
          ? undefined
          : {
              method,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
      ),
    );
  const upload = () =>
    request("/api/payments/uploads", {
      courseId,
      contentType: "image/png",
      size: 8,
    });
  const seed = () => {
    state.payment = {
      id,
      studentId,
      courseId,
      receiptKey: "receipts/a",
      courseName: "English",
      amount: new Prisma.Decimal(50),
      status: "pending",
      startDate: null,
      endDate: null,
    };
  };
  return { state, calls, request, upload, seed };
}

describe("monthly payment flow", () => {
  test("students can only upload for active enrolled courses", async () => {
    const f = fixture();
    f.state.eligible = false;
    expect((await f.upload()).status).toBe(422);
    expect(f.state.upload).toBeNull();
    expect(f.calls[0].args.where).toMatchObject({ studentId, courseId });
  });
  test("price comes from course and cannot be supplied by student", async () => {
    const f = fixture();
    expect(
      (
        await f.request("/api/payments/uploads", {
          courseId,
          contentType: "image/png",
          size: 8,
          amount: "1.00",
        })
      ).status,
    ).toBe(422);
    const response = await f.upload();
    expect(response.status).toBe(201);
    expect((await response.json()).amount).toBe("50.00");
  });
  test("submission snapshots price and is idempotent by upload id", async () => {
    const f = fixture();
    await f.upload();
    const body = { uploadId: f.state.upload.id };
    expect((await f.request("/api/payments", body)).status).toBe(201);
    expect((await f.request("/api/payments", body)).status).toBe(200);
    expect(f.calls.filter((c) => c.name === "finalize")).toHaveLength(1);
    expect(f.state.payment.amount.toFixed(2)).toBe("50.00");
    expect(f.calls.find((call) => call.name === "create")!.args.status).toBe(
      "pending",
    );
  });
  test("another student's upload and expired upload are rejected", async () => {
    const f = fixture();
    await f.upload();
    f.state.upload.studentId = userId;
    expect(
      (await f.request("/api/payments", { uploadId: f.state.upload.id }))
        .status,
    ).toBe(404);
    f.state.upload.studentId = studentId;
    f.state.upload.expiresAt = new Date(0);
    expect(
      (await f.request("/api/payments", { uploadId: f.state.upload.id }))
        .status,
    ).toBe(422);
    expect(f.calls.some((c) => c.name === "finalize")).toBe(false);
  });
  test("history is scoped to the student and last six months", async () => {
    const f = fixture();
    expect((await f.request("/api/payments")).status).toBe(200);
    const where = f.calls.find((c) => c.name === "history")!.args.where;
    expect(where.studentId).toBe(studentId);
    expect(where.submittedAt.gte).toBeInstanceOf(Date);
  });
  for (const role of ["manager", "teacher", "student", null] as const) {
    test(`${role} cannot review payments`, async () => {
      const f = fixture(role);
      expect(
        (
          await f.request(
            `/api/payments/${id}/review`,
            { status: "approved", startDate: "2026-01-31" },
            "PATCH",
          )
        ).status,
      ).toBe(role ? 403 : 401);
      expect(
        (
          await f.request(
            `/api/payments/${id}/review`,
            { status: "cancelled" },
            "PATCH",
          )
        ).status,
      ).toBe(role ? 403 : 401);
      expect(f.calls.some((c) => c.name === "review")).toBe(false);
    });
  }
  for (const role of ["manager", "teacher"] as const) {
    test(`${role} cannot read payments or receipts`, async () => {
      const f = fixture(role);
      expect((await f.request("/api/payments")).status).toBe(403);
      expect((await f.request(`/api/payments/${id}/receipt`)).status).toBe(403);
    });
  }
  test("receipt lookup applies ownership and does not sign missing receipts", async () => {
    const f = fixture();
    expect((await f.request(`/api/payments/${id}/receipt`)).status).toBe(404);
    expect(
      f.calls.find((c) => c.name === "findPayment")!.args.where.AND,
    ).toContainEqual({ studentId });
    expect(f.calls.some((c) => c.name === "view")).toBe(false);
  });
  test("admin approval requires a valid date and calculates one calendar month", async () => {
    const f = fixture("admin");
    f.seed();
    expect(
      (
        await f.request(
          `/api/payments/${id}/review`,
          { status: "approved" },
          "PATCH",
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await f.request(
          `/api/payments/${id}/review`,
          { status: "approved", startDate: "2026-02-30" },
          "PATCH",
        )
      ).status,
    ).toBe(422);
    const response = await f.request(
      `/api/payments/${id}/review`,
      { status: "approved", startDate: "2026-01-31" },
      "PATCH",
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "approved",
      startDate: "2026-01-31",
      endDate: "2026-02-28",
      reviewedBy: userId,
    });
  });
  test("overlapping periods and already-reviewed payments return conflict", async () => {
    const f = fixture("admin");
    f.seed();
    f.state.overlap = true;
    expect(
      (
        await f.request(
          `/api/payments/${id}/review`,
          { status: "approved", startDate: "2026-01-31" },
          "PATCH",
        )
      ).status,
    ).toBe(409);
    f.state.overlap = false;
    f.state.updateCount = 0;
    expect(
      (
        await f.request(
          `/api/payments/${id}/review`,
          { status: "cancelled" },
          "PATCH",
        )
      ).status,
    ).toBe(409);
  });
  test("cancellation records the admin and accepts an optional reason", async () => {
    const f = fixture("admin");
    f.seed();
    expect(
      (
        await f.request(
          `/api/payments/${id}/review`,
          { status: "cancelled", cancellationReason: " " },
          "PATCH",
        )
      ).status,
    ).toBe(422);
    const response = await f.request(
      `/api/payments/${id}/review`,
      { status: "cancelled", cancellationReason: "Unreadable" },
      "PATCH",
    );
    expect(await response.json()).toMatchObject({
      status: "cancelled",
      cancellationReason: "Unreadable",
      reviewedBy: userId,
      startDate: null,
    });
  });
  test("calendar month handles leap years", () => {
    expect(
      addCalendarMonths(new Date("2028-01-31T00:00:00Z"), 1)
        .toISOString()
        .slice(0, 10),
    ).toBe("2028-02-29");
  });
  for (const decision of ["approved", "cancelled"] as const) {
    test(`submission stays pending through admin inspection; explicit ${decision} is visible to student`, async () => {
      const f = fixture("student");
      await f.upload();
      const submitted = await f.request("/api/payments", {
        uploadId: f.state.upload.id,
      });
      expect(await submitted.json()).toMatchObject({
        status: "pending",
        reviewedAt: null,
        reviewedBy: null,
      });
      f.state.role = "admin";
      for (let i = 0; i < 2; i++) {
        expect(
          (await (await f.request("/api/payments?status=pending")).json())[0],
        ).toMatchObject({
          status: "pending",
          availableActions: ["approve", "cancel"],
        });
        expect(
          await (await f.request(`/api/payments/${id}`)).json(),
        ).toMatchObject({
          status: "pending",
          availableActions: ["approve", "cancel"],
        });
        expect((await f.request(`/api/payments/${id}/receipt`)).status).toBe(
          200,
        );
      }
      expect(f.calls.filter((call) => call.name === "review")).toHaveLength(0);
      expect(f.state.payment.status).toBe("pending");
      const body =
        decision === "approved"
          ? { status: decision, startDate: "2026-10-21" }
          : { status: decision };
      const reviewed = await f.request(
        `/api/payments/${id}/review`,
        body,
        "PATCH",
      );
      expect(reviewed.status).toBe(200);
      expect(await reviewed.json()).toMatchObject({
        status: decision,
        reviewedBy: userId,
        availableActions: [],
      });
      expect(f.state.payment.status).toBe(decision);
      expect(
        (await f.request(`/api/payments/${id}/review`, body, "PATCH")).status,
      ).toBe(409);
      f.state.role = "student";
      const history = await f.request("/api/payments");
      expect(history.headers.get("Cache-Control")).toBe("private, no-store");
      expect((await history.json())[0]).toMatchObject({
        status: decision,
        availableActions: [],
      });
      expect(
        await (await f.request(`/api/payments/${id}`)).json(),
      ).toMatchObject({ status: decision });
    });
  }
  test("receipt signature must match declared image type", () => {
    expect(
      isReceiptImage(Buffer.from("<script>alert(1)</script>"), "image/png"),
    ).toBe(false);
    expect(
      isReceiptImage(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        "image/png",
      ),
    ).toBe(true);
    expect(
      isReceiptImage(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        "image/jpeg",
      ),
    ).toBe(false);
  });
});
