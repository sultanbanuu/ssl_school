import "dotenv/config";
import { createDatabase } from "../src/db";
import { createAuth } from "../src/auth";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { provisionAccount } from "../src/accounts";

// Opt-in integration check against the configured database. Cleans only its own records.
const config = loadConfig();
const db = createDatabase(config.DATABASE_URL);
const auth = createAuth(db, config);
const app = createApp({ db, getSession: headers => auth.api.getSession({ headers }), authHandler: auth.handler, origins: config.TRUSTED_ORIGINS });
const tag = crypto.randomUUID();
const password = crypto.randomUUID() + "Aa1!";
const email = (role: string) => `${role}-${tag}@example.test`;
const profiles: string[] = [];
let courseId: string | undefined;
async function request(path: string, expected: number, body?: unknown, cookie = "") {
  const response = await app.handle(new Request(`${config.BETTER_AUTH_URL}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", origin: new URL(config.BETTER_AUTH_URL).origin, cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
  if (response.status !== expected) throw new Error(`${path}: expected ${expected}, received ${response.status}: ${await response.text()}`);
  console.log(`PASS ${path} → ${expected}`);
  return { data: await response.json(), cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") };
}
try {
  const admin = await provisionAccount(db, { email: email("admin"), password, firstName: "Integration Test", role: "admin" });
  profiles.push(admin.id);
  const login = await request("/api/auth/sign-in/email", 200, { email: email("admin"), password });
  if (!login.cookie) throw new Error("Login did not issue a session cookie");
  const cookie = login.cookie;
  await request("/api/me", 200, undefined, cookie);
  const teacher = (await request("/api/teachers", 201, { email: email("teacher"), password, firstName: "Test Teacher", specialization: "English" }, cookie)).data;
  profiles.push(teacher.profileId);
  const student = (await request("/api/students", 201, { email: email("student"), password, firstName: "Test Student" }, cookie)).data;
  profiles.push(student.profileId);
  const course = (await request("/api/courses", 201, { name: `Integration ${tag}`, category: "English", price: "50.00", teacherId: teacher.id }, cookie)).data;
  courseId = course.id;
  const body = { studentId: student.id, courseId };
  const enrollment = (await request("/api/enrollments", 201, body, cookie)).data;
  if (enrollment.teacherId !== teacher.id) throw new Error("Enrollment teacher does not match course teacher");
  const stored = await db.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
  if (stored.studentId !== student.id || stored.courseId !== courseId || stored.teacherId !== teacher.id) throw new Error("Stored enrollment relationships differ");
  console.log("PASS enrollment relationships persisted in PostgreSQL");
  await request("/api/enrollments", 409, body, cookie);
  await request("/api/enrollments", 422, { ...body, teacherId: teacher.id }, cookie);
  await request("/api/enrollments", 401);
  const studentLogin = await request("/api/auth/sign-in/email", 200, { email: email("student"), password });
  await request("/api/enrollments", 403, body, studentLogin.cookie);
  const teacherLogin = await request("/api/auth/sign-in/email", 200, { email: email("teacher"), password });
  const visible = (await request("/api/enrollments", 200, undefined, teacherLogin.cookie)).data;
  if (!visible.some((row: { id: string }) => row.id === enrollment.id)) throw new Error("Teacher cannot see assigned enrollment");
  await request("/api/lessons", 404, undefined, cookie);
} finally {
  await db.$transaction(async tx => {
    if (courseId) {
      await tx.enrollment.deleteMany({ where: { courseId } });
      await tx.course.delete({ where: { id: courseId } });
    }
    await tx.student.deleteMany({ where: { profileId: { in: profiles } } });
    await tx.teacher.deleteMany({ where: { profileId: { in: profiles } } });
    await tx.admin.deleteMany({ where: { profileId: { in: profiles } } });
    await tx.user.deleteMany({ where: { id: { in: profiles } } });
  });
  await db.$disconnect();
  console.log("Temporary test records removed");
}
