import { afterAll, beforeAll, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readdir } from "node:fs/promises";

// Run real PostgreSQL SQL/constraints in a disposable WASM database.
// This does not replace deployment testing against the target PostgreSQL server.
const db = new PGlite();
const studentProfile = "11111111-1111-4111-8111-111111111111";
const teacherProfile = "22222222-2222-4222-8222-222222222222";
const studentId = "33333333-3333-4333-8333-333333333333";
const teacherId = "44444444-4444-4444-8444-444444444444";
const courseId = "55555555-5555-4555-8555-555555555555";
beforeAll(async () => {
  const root = new URL("../prisma/migrations/", import.meta.url);
  for (const entry of (await readdir(root, { withFileTypes: true })).filter((e) => e.isDirectory()).sort((a,b) => a.name.localeCompare(b.name))) {
    await db.exec(await Bun.file(new URL(`${entry.name}/migration.sql`, root)).text());
  }
  for (const [id, role] of [[studentProfile, "student"], [teacherProfile, "teacher"]]) {
    await db.query('INSERT INTO auth_users (id, name, email, "updatedAt") VALUES ($1, $2, $3, now())', [id, role, `${role}@example.test`]);
    await db.query('INSERT INTO profiles (id, role, updated_at) VALUES ($1, $2::"position", now())', [id, role]);
  }
  await db.query("INSERT INTO students (id, profile_id) VALUES ($1, $2)", [studentId, studentProfile]);
  await db.query("INSERT INTO teachers (id, profile_id, specialization) VALUES ($1, $2, 'English')", [teacherId, teacherProfile]);
  await db.query("INSERT INTO courses (id, name, category, price, teacher_id, updated_at) VALUES ($1, 'English', 'General', 50.00, $2, now())", [courseId, teacherId]);
}, 30000);
afterAll(async () => { await db.close(); });

test("migrations recreate all school and authentication tables", async () => {
  const result = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'");
  expect(result.rows[0].count).toBe(16);
});

test("lesson status accepts rescheduled after migrations", async () => {
  const result = await db.query<{ status: string }>(`SELECT 'rescheduled'::"LessonStatus" AS status`);
  expect(result.rows[0].status).toBe("rescheduled");
});
test("duplicate student/course enrollment is rejected by PostgreSQL", async () => {
  const insert = () => db.query("INSERT INTO enrollments (id, student_id, course_id, teacher_id) VALUES ($1, $2, $3, $4)", [crypto.randomUUID(), studentId, courseId, teacherId]);
  await insert();
  await expect(insert()).rejects.toThrow(/unique constraint/);
});
test("role records cannot duplicate a profile", async () => {
  await expect(db.query("INSERT INTO students (id, profile_id) VALUES ($1, $2)", [crypto.randomUUID(), studentProfile])).rejects.toThrow(/unique constraint/);
});
test("payment cannot reference a missing course", async () => {
  await expect(db.query("INSERT INTO payments (id, student_id, course_id, amount, reciept_url) VALUES ($1, $2, $3, 10, 'private-key')", [crypto.randomUUID(), studentId, crypto.randomUUID()])).rejects.toThrow(/foreign key constraint/);
});
test("negative payments fail at database layer", async () => {
  await expect(db.query("INSERT INTO payments (id, student_id, course_id, amount, reciept_url) VALUES ($1, $2, $3, -10, 'private-key')", [crypto.randomUUID(), studentId, courseId])).rejects.toThrow(/check constraint/);
});

test("new payments enforce one pending per course and complete review metadata", async () => {
  const paymentId = crypto.randomUUID();
  const uploadId = crypto.randomUUID();
  const nextUploadId = crypto.randomUUID();
  for (const key of [uploadId, nextUploadId]) {
    await db.query(`INSERT INTO payment_uploads (id, student_id, course_id, object_key, content_type, size, amount, course_name, expires_at)
      VALUES ($1, $2, $3, $4, 'image/png', 8, 50, 'English', now() + interval '15 minutes')`, [key, studentId, courseId, `staging/${key}`]);
  }
  const insert = (pid: string, uid: string) => db.query(`INSERT INTO payments
    (id, student_id, course_id, amount, receipt_key, upload_id, course_name, submitted_at)
    VALUES ($1, $2, $3, 50, $4, $5, 'English', now())`, [pid, studentId, courseId, `receipts/${pid}`, uid]);
  await insert(paymentId, uploadId);
  expect((await db.query<{ status: string }>("SELECT status FROM payments WHERE id = $1", [paymentId])).rows[0].status).toBe("pending");
  await expect(insert(crypto.randomUUID(), nextUploadId)).rejects.toThrow(/unique constraint/);
  await expect(db.query("UPDATE payments SET status = 'approved' WHERE id = $1", [paymentId])).rejects.toThrow(/check constraint/);
  await expect(db.query("UPDATE payments SET status = 'cancelled' WHERE id = $1", [paymentId])).rejects.toThrow(/check constraint/);
  await db.query("UPDATE payments SET status = 'approved', reviewed_at = now(), reviewed_by = $2, start_date = '2026-10-19', end_date = '2026-11-19' WHERE id = $1", [paymentId, studentProfile]);
  const nextPaymentId = crypto.randomUUID();
  await insert(nextPaymentId, nextUploadId);
  await db.query("UPDATE payments SET status = 'cancelled', reviewed_at = now(), reviewed_by = $2 WHERE id = $1", [nextPaymentId, studentProfile]);
  const saved = await db.query<{ status: string; reviewed_by: string }>("SELECT status, reviewed_by FROM payments WHERE id = $1 AND student_id = $2", [nextPaymentId, studentId]);
  expect(saved.rows[0]).toEqual({ status: "cancelled", reviewed_by: studentProfile });
});
test("every application table enables row-level security", async () => {
  const result = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity");
  expect(result.rows).toHaveLength(0);
});
test("an unprivileged role cannot read school records even with SELECT grants", async () => {
  await db.exec("CREATE ROLE school_reader; GRANT USAGE ON SCHEMA public TO school_reader; GRANT SELECT ON ALL TABLES IN SCHEMA public TO school_reader; SET ROLE school_reader;");
  try {
    const result = await db.query("SELECT * FROM profiles");
    expect(result.rows).toHaveLength(0);
  } finally { await db.exec("RESET ROLE;"); }
});
