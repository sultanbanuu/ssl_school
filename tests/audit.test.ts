import { afterAll, beforeAll, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readdir } from "node:fs/promises";
import { createApp } from "../src/app";
import type { PrismaClient } from "../src/generated/prisma/client";
import type { Role } from "../src/generated/prisma/enums";
import { setAuditActor } from "../src/shared/audit";

const db = new PGlite();
const actor = crypto.randomUUID(), studentProfile = crypto.randomUUID(), teacherProfile = crypto.randomUUID();
const student = crypto.randomUUID(), teacher = crypto.randomUUID(), course = crypto.randomUUID(), enrollment = crypto.randomUUID();
type Row = { actor_id: string | null; actor_role: string | null; entity_type: string; entity_id: string; action: string; before: any; after: any; transaction_id: string };
const logs = async (id: string) => (await db.query<Row>("SELECT * FROM audit_logs WHERE entity_id=$1 ORDER BY created_at, id", [id])).rows;
beforeAll(async () => {
  const root = new URL("../prisma/migrations/", import.meta.url);
  for (const entry of (await readdir(root, { withFileTypes: true })).filter(e => e.isDirectory()).sort((a,b) => a.name.localeCompare(b.name))) await db.exec(await Bun.file(new URL(`${entry.name}/migration.sql`, root)).text());
  await db.exec(await Bun.file(new URL("../scripts/sql/runtime-role.sql", import.meta.url)).text());
  await db.exec(await Bun.file(new URL("../scripts/sql/runtime-permissions.sql", import.meta.url)).text());
  for (const [id, role] of [[actor, "admin"], [studentProfile, "student"], [teacherProfile, "teacher"]]) {
    await db.query('INSERT INTO auth_users (id, name, email, "updatedAt") VALUES ($1, $2, $3, now())', [id, role, `${id}@example.test`]);
    await db.query('INSERT INTO profiles (id, role, updated_at) VALUES ($1, $2::"position", now())', [id, role]);
  }
  await db.query("INSERT INTO students (id, profile_id) VALUES ($1, $2)", [student, studentProfile]);
  await db.query("INSERT INTO teachers (id, profile_id, specialization) VALUES ($1, $2, 'English')", [teacher, teacherProfile]);
  await db.query("INSERT INTO courses (id, name, category, price, teacher_id, updated_at) VALUES ($1, 'Audit course', 'English', 50, $2, now())", [course, teacher]);
  await db.query("INSERT INTO enrollments (id, student_id, course_id, teacher_id) VALUES ($1, $2, $3, $4)", [enrollment, student, course, teacher]);
}, 30000);
afterAll(() => db.close());

async function transaction(work: () => Promise<void>, withActor = true) {
  await db.exec("SET SESSION AUTHORIZATION school_app; BEGIN");
  try {
    if (withActor) await db.query("SELECT set_config('school.audit_actor', $1, true)", [JSON.stringify({ id: actor, role: "admin" })]);
    await work(); await db.exec("COMMIT");
  } catch (e) { await db.exec("ROLLBACK"); throw e; }
  finally { await db.exec("SET SESSION AUTHORIZATION postgres"); }
}
async function lesson(id: string) {
  await db.query("INSERT INTO lessons (id, enrollment_id, teacher_id, date, start_time, end_time) VALUES ($1, $2, $3, '2099-11-02', '10:00', '11:00')", [id, enrollment, teacher]);
}

test("payment audit records actor and before/after without receipt secrets", async () => {
  const id = crypto.randomUUID();
  await transaction(async () => {
    await db.query("INSERT INTO payments (id, student_id, course_id, amount, reciept_url) VALUES ($1, $2, $3, 50, 'private-receipt-secret')", [id, student, course]);
    await db.query("UPDATE payments SET amount=75 WHERE id=$1", [id]);
  });
  const rows = await logs(id);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ actor_id: actor, actor_role: "admin", entity_type: "payment", action: "created", before: null });
  expect(rows[1].before.amount).toBe(50); expect(rows[1].after.amount).toBe(75);
  expect(rows[0].transaction_id).toBe(rows[1].transaction_id);
  expect(JSON.stringify(rows)).not.toContain("private-receipt-secret");
  expect(rows[0].after).not.toHaveProperty("reciept_url");
  expect(rows[0].after).not.toHaveProperty("receipt_key");
});

test("role changes are recorded while unrelated profile edits are ignored", async () => {
  const before = (await logs(studentProfile)).length;
  await transaction(async () => {
    await db.query("UPDATE profiles SET phone='+15555550100' WHERE id=$1", [studentProfile]);
    await db.query("UPDATE profiles SET role='manager' WHERE id=$1", [studentProfile]);
  });
  const rows = await logs(studentProfile);
  expect(rows).toHaveLength(before + 1);
  expect(rows.at(-1)).toMatchObject({ before: { id: studentProfile, role: "student" }, after: { id: studentProfile, role: "manager" }, actor_id: actor });
});

test("bulk lesson changes and deletions each retain a durable snapshot", async () => {
  const first = crypto.randomUUID(), second = crypto.randomUUID();
  await transaction(async () => {
    await lesson(first); await lesson(second);
    await db.query("UPDATE lessons SET status='cancelled' WHERE id=ANY($1::uuid[])", [[first, second]]);
    await db.query("UPDATE lessons SET reminder_sent_at=now() WHERE id=$1", [first]);
    await db.query("DELETE FROM lessons WHERE id=$1", [first]);
  });
  const rows = await logs(first);
  expect(rows.map(r => r.action)).toEqual(["created", "updated", "deleted"]);
  expect(rows[1].before.status).toBe("scheduled"); expect(rows[1].after.status).toBe("cancelled");
  expect(rows[2].before.id).toBe(first); expect(rows[2].after).toBeNull();
  expect((await logs(second)).map(r => r.action)).toEqual(["created", "updated"]);
});

test("availability, trial, and reschedule decisions are captured", async () => {
  const slot = crypto.randomUUID(), trial = crypto.randomUUID(), booking = crypto.randomUUID(), request = crypto.randomUUID();
  await transaction(async () => {
    await db.query("INSERT INTO availability_slots (id, teacher_id, course_id, starts_at, ends_at) VALUES ($1, $2, $3, '2099-11-03T10:00:00Z', '2099-11-03T11:00:00Z')", [slot, teacher, course]);
    await db.query("INSERT INTO trial_requests (id, slot_id, student_id, updated_at) VALUES ($1, $2, $3, now())", [trial, slot, student]);
    await db.query("UPDATE trial_requests SET status='approved' WHERE id=$1", [trial]);
    await lesson(booking);
    await db.query("INSERT INTO reschedule_requests (id, lesson_id, student_id, teacher_id, original_start, original_end, starts_at, ends_at) VALUES ($1, $2, $3, $4, '2099-11-02T06:00:00Z', '2099-11-02T07:00:00Z', '2099-11-03T06:00:00Z', '2099-11-03T07:00:00Z')", [request, booking, student, teacher]);
    await db.query("UPDATE reschedule_requests SET status='rejected', reviewed_by=$2, review_note='Time unavailable' WHERE id=$1", [request, actor]);
  });
  expect((await logs(slot))[0].entity_type).toBe("availability");
  expect((await logs(trial)).at(-1)?.after.status).toBe("approved");
  expect((await logs(request)).at(-1)?.after).toMatchObject({ status: "rejected", reviewed_by: actor, review_note: "Time unavailable" });
});

test("rolled-back mutations leave no audit events and actor context does not leak", async () => {
  const failed = crypto.randomUUID(), next = crypto.randomUUID();
  await expect(transaction(async () => { await lesson(failed); await db.exec("SELECT 1/0"); })).rejects.toThrow();
  expect(await logs(failed)).toHaveLength(0);
  await transaction(() => lesson(next), false);
  expect((await logs(next))[0].actor_id).toBeNull();
});

test("audit insert failure rolls back the original mutation", async () => {
  const id = crypto.randomUUID();
  await db.exec("ALTER TABLE audit_logs ADD CONSTRAINT test_audit_failure CHECK (action <> 'created') NOT VALID");
  try { await expect(transaction(() => lesson(id))).rejects.toThrow(); }
  finally { await db.exec("ALTER TABLE audit_logs DROP CONSTRAINT test_audit_failure"); }
  expect((await db.query("SELECT FROM lessons WHERE id=$1", [id])).rows).toHaveLength(0);
  expect(await logs(id)).toHaveLength(0);
});

test("runtime can read but cannot insert, edit, delete, or truncate audit history", async () => {
  await db.exec("SET SESSION AUTHORIZATION school_app");
  try {
    expect((await db.query("SELECT FROM audit_logs")).rows.length).toBeGreaterThan(0);
    for (const sql of ["INSERT INTO audit_logs DEFAULT VALUES", "UPDATE audit_logs SET action='deleted'", "DELETE FROM audit_logs", "TRUNCATE audit_logs", "ALTER TABLE lessons DISABLE TRIGGER audit_lesson"]) await expect(db.exec(sql)).rejects.toThrow();
  } finally { await db.exec("SET SESSION AUTHORIZATION postgres"); }
});

test("actor context is parameterized and transaction-local", async () => {
  let captured: unknown[] = [];
  const tx = { $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => { captured = [strings.join("?"), ...values]; } };
  await setAuditActor(tx as any, { id: actor, role: "admin", studentId: null, teacherId: null });
  expect(captured).toEqual(["SELECT set_config('school.audit_actor', ?, true)", JSON.stringify({ id: actor, role: "admin" })]);
});

test("audit API is admin-only, bounded, filtered, and non-cacheable", async () => {
  for (const role of [null, "student", "teacher", "manager", "admin"] as const) {
    const calls: any[] = [];
    const database = { profile: { findUnique: async () => ({ id: actor, role }) }, auditLog: { findMany: async (args: any) => { calls.push(args); return [{ id: "first" }, { id: "extra" }]; } } } as unknown as PrismaClient;
    const app = createApp({ db: database, origins: [], getSession: async () => role ? { user: { id: actor } } : null, authHandler: async () => new Response() }).compile();
    const response = await app.handle(new Request(`http://localhost/api/audit-logs?entityType=payment&entityId=${actor}&actorId=${actor}&action=updated&limit=1&offset=2`));
    expect(response.status).toBe(role === "admin" ? 200 : role ? 403 : 401);
    if (role !== "admin") { expect(calls).toHaveLength(0); continue; }
    expect(await response.json()).toEqual({ items: [{ id: "first" }], hasMore: true });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(calls[0]).toMatchObject({ where: { entityType: "payment", entityId: actor, actorId: actor, action: "updated" }, take: 2, skip: 2 });
    for (const query of ["limit=101", "offset=-1", "entityId=bad", "entityType=auth_users", "action=erase"]) expect((await app.handle(new Request(`http://localhost/api/audit-logs?${query}`))).status).toBe(422);
    for (const method of ["POST", "PATCH", "DELETE"]) expect((await app.handle(new Request("http://localhost/api/audit-logs", { method }))).status).toBe(404);
  }
});
