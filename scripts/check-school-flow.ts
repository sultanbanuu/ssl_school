import "dotenv/config";
import { strict as assert } from "node:assert";
import { createDatabase } from "../src/db";
import { loadConfig } from "../src/config";
import { provisionAccount } from "../src/accounts";

// Exercises the running HTTP server. Creates and removes only UUID-tagged test data.
const config = loadConfig();
const db = createDatabase(config.DATABASE_URL);
const baseURL = config.BETTER_AUTH_URL.replace(/\/$/, "");
const tag = crypto.randomUUID();
const password = crypto.randomUUID() + "Aa1!";
const email = (role: string) => `school-flow-${role}-${tag}@example.test`;
let cookie = "";
async function request(path: string, expected: number, body?: unknown, method = body === undefined ? "GET" : "POST") {
  const response = await fetch(`${baseURL}${path}`, {
    method, redirect: "error", signal: AbortSignal.timeout(15_000),
    headers: { "content-type": "application/json", origin: new URL(baseURL).origin, cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  // Keep failure output free of credentials and session cookies.
  assert.equal(response.status, expected, `${method} ${path}: unexpected HTTP status`);
  const data = await response.json();
  console.log(`PASS ${method} ${path} → ${expected}`);
  return { data, cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") };
}
try {
  const health = await request("/health", 200);
  assert.equal(health.data.service, "ssl-school-api");
  await request("/ready", 200);
  const admin = await provisionAccount(db, { email: email("admin"), password, firstName: "Workflow Admin", role: "admin" });
  cookie = (await request("/api/auth/sign-in/email", 200, { email: email("admin"), password })).cookie;
  assert.ok(cookie, "Admin login must issue a session");
  assert.equal((await request("/api/me", 200)).data.id, admin.id, "Server must use the configured test database");

  const teacherInput = { email: email("teacher"), password, firstName: "Workflow Teacher", specialization: "General English" };
  const teacher = (await request("/api/teachers", 201, teacherInput)).data;
  const studentInput = { email: email("student"), password, firstName: "Workflow Student" };
  const student = (await request("/api/students", 201, studentInput)).data;
  await request("/api/teachers", 409, teacherInput);
  await request("/api/students", 409, studentInput);

  await request(`/api/teachers/${teacher.id}`, 200, { firstName: "Updated Teacher", lastName: "Example", phone: "+994000000000", specialization: "IELTS" }, "PATCH");
  await request(`/api/students/${student.id}`, 200, { firstName: "Updated Student", lastName: "Example", englishLevel: "B1", learningGoal: "Conversation", status: "active" }, "PATCH");
  const teacherRead = (await request(`/api/teachers/${teacher.id}`, 200)).data;
  const studentRead = (await request(`/api/students/${student.id}`, 200)).data;
  assert.equal(teacherRead.specialization, "IELTS");
  assert.equal(teacherRead.profile.firstName, "Updated Teacher");
  assert.equal(teacherRead.profile.phone, "+994000000000");
  assert.equal(studentRead.englishLevel, "B1");
  assert.equal(studentRead.learningGoal, "Conversation");
  assert.equal(studentRead.profile.firstName, "Updated Student");
  for (const [profileId, name] of [[teacher.profileId, "Updated Teacher Example"], [student.profileId, "Updated Student Example"]]) {
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: profileId } })).name, name);
  }
  console.log("PASS teacher/student updates persist and synchronize authentication names");

  const courseInput = { name: `School workflow ${tag}`, category: "English", price: "50.00", teacherId: teacher.id };
  await request("/api/courses", 422, { ...courseInput, teacherId: crypto.randomUUID() });
  const course = (await request("/api/courses", 201, courseInput)).data;
  assert.equal(course.teacherId, teacher.id);
  assert.equal(course.price, "50.00");
  const enrollmentInput = { studentId: student.id, courseId: course.id };
  await request(`/api/students/${student.id}`, 200, { status: "inactive" }, "PATCH");
  await request("/api/enrollments", 422, enrollmentInput);
  await request(`/api/students/${student.id}`, 200, { status: "active" }, "PATCH");
  await request("/api/enrollments", 422, { ...enrollmentInput, teacherId: crypto.randomUUID() });
  const enrollment = (await request("/api/enrollments", 201, enrollmentInput)).data;
  await request("/api/enrollments", 409, enrollmentInput);
  const stored = await db.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
  assert.equal(stored.studentId, student.id);
  assert.equal(stored.courseId, course.id);
  assert.equal(stored.teacherId, teacher.id);
  assert.equal((await db.course.findUniqueOrThrow({ where: { id: course.id } })).teacherId, teacher.id);
  console.log("PASS course assignment and enrollment relationships persist in PostgreSQL");
  await request("/api/auth/sign-out", 200, {});
  await request(`/api/students/${student.id}`, 401);
  console.log("PASS school admin workflow through the running HTTP server");
} finally {
  try {
    // Query by this run's exact emails, including accounts whose HTTP response failed.
    const users = await db.user.findMany({ where: { email: { in: [email("admin"), email("teacher"), email("student")] } }, select: { id: true } });
    const ids = users.map(user => user.id);
    await db.$transaction(async tx => {
      const teachers = await tx.teacher.findMany({ where: { profileId: { in: ids } }, select: { id: true } });
      const teacherIds = teachers.map(teacher => teacher.id);
      await tx.enrollment.deleteMany({ where: { course: { teacherId: { in: teacherIds } } } });
      await tx.course.deleteMany({ where: { teacherId: { in: teacherIds } } });
      await tx.student.deleteMany({ where: { profileId: { in: ids } } });
      await tx.teacher.deleteMany({ where: { profileId: { in: ids } } });
      await tx.admin.deleteMany({ where: { profileId: { in: ids } } });
      await tx.user.deleteMany({ where: { id: { in: ids } } });
    });
    console.log("Temporary school workflow records removed");
  } finally { await db.$disconnect(); }
}
