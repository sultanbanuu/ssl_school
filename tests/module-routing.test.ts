import { expect, test } from "bun:test";
import { createApp } from "../src/app";
import { Prisma, type PrismaClient } from "../src/generated/prisma/client";

type Dependencies = Parameters<typeof createApp>[0];
const userId = "11111111-1111-4111-8111-111111111111";
const teacherId = "22222222-2222-4222-8222-222222222222";

function app(overrides: Partial<Dependencies> = {}) {
  return createApp({
    db: {} as PrismaClient,
    getSession: async () => null,
    authHandler: async () => new Response(),
    origins: ["http://localhost:8081"],
    ...overrides,
  }).compile();
}

test("liveness remains public and does not access auth or the database", async () => {
  const api = app({ getSession: async () => { throw new Error("Unexpected authentication"); } });
  const response = await api.handle(new Request("http://localhost/health"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok", service: "ssl-school-api" });
});

test("readiness returns 200 after the database probe succeeds", async () => {
  let probes = 0;
  const api = app({ db: { $queryRaw: async () => { probes++; return []; } } as unknown as PrismaClient });
  const response = await api.handle(new Request("http://localhost/ready"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ready" });
  expect(probes).toBe(1);
});

test("readiness returns 503 without exposing database errors", async () => {
  const api = app({ db: { $queryRaw: async () => { throw new Error("Database unavailable"); } } as unknown as PrismaClient });
  const response = await api.handle(new Request("http://localhost/ready"));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "unavailable" });
});

test("auth wildcard forwards GET and POST requests and preserves handler responses", async () => {
  const api = app({
    authHandler: async request => new Response(JSON.stringify({
      path: new URL(request.url).pathname,
      query: new URL(request.url).search,
      method: request.method,
      body: await request.text(),
      header: request.headers.get("x-test"),
    }), { status: 202, headers: { "content-type": "application/json", "x-auth": "forwarded" } }),
  });
  for (const method of ["GET", "POST"]) {
    const body = method === "POST" ? '{"email":"test@example.test"}' : undefined;
    const response = await api.handle(new Request("http://localhost/api/auth/custom?next=school", {
      method,
      headers: { "x-test": "original", ...(body ? { "content-type": "application/json" } : {}) },
      body,
    }));
    expect(response.status).toBe(202);
    expect(response.headers.get("x-auth")).toBe("forwarded");
    expect(await response.json()).toEqual({ path: "/api/auth/custom", query: "?next=school", method, body: body ?? "", header: "original" });
  }
});

test("profile module returns the authenticated user's profile", async () => {
  const profile = { id: userId, role: "student", firstName: "Test", student: { id: teacherId }, teacher: null };
  const calls: unknown[] = [];
  const api = app({
    getSession: async () => ({ user: { id: userId } }),
    db: { profile: { findUnique: async (args: unknown) => { calls.push(args); return profile; } } } as unknown as PrismaClient,
  });
  const response = await api.handle(new Request("http://localhost/api/me"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(profile);
  expect(calls).toEqual(Array(2).fill({ where: { id: userId }, include: { student: true, teacher: true } }));
});

test("profile module rejects anonymous and unprovisioned accounts", async () => {
  const anonymous = await app().handle(new Request("http://localhost/api/me"));
  expect(anonymous.status).toBe(401);
  expect(await anonymous.json()).toEqual({ error: "Authentication required" });
  const unprovisioned = await app({
    getSession: async () => ({ user: { id: userId } }),
    db: { profile: { findUnique: async () => null } } as unknown as PrismaClient,
  }).handle(new Request("http://localhost/api/me"));
  expect(unprovisioned.status).toBe(403);
  expect(await unprovisioned.json()).toEqual({ error: "Account has not been provisioned" });
});

test("course creation keeps validation defaults, bigint storage and decimal response formatting", async () => {
  let stored: any;
  const api = app({
    getSession: async () => ({ user: { id: userId } }),
    db: {
      profile: { findUnique: async () => ({ id: userId, role: "admin" }) },
      course: { create: async ({ data }: { data: any }) => { stored = data; return { id: userId, ...data, price: new Prisma.Decimal(data.price) }; } },
    } as unknown as PrismaClient,
  });
  const response = await api.handle(new Request("http://localhost/api/courses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "English", category: "Languages", price: "50", duration: 12, teacherId }),
  }));
  expect(response.status).toBe(201);
  expect(stored.duration).toBe(12n);
  expect(stored.active).toBe(true);
  expect(await response.json()).toEqual({ id: userId, name: "English", category: "Languages", price: "50.00", duration: "12", teacherId, active: true });
});
