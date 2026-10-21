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
async function checkSession(cookie: string, userId: string) {
  const session = (await request("/api/auth/get-session", 200, undefined, cookie)).data;
  if (session?.user?.id !== userId) throw new Error("Session did not restore the expected user");
}
async function checkLogout(cookie: string) {
  await request("/api/auth/sign-out", 200, {}, cookie);
  await request("/api/me", 401, undefined, cookie);
  const session = (await request("/api/auth/get-session", 200, undefined, cookie)).data;
  if (session !== null) throw new Error("Signed-out session is still valid");
}
async function request(path: string, expected: number, body?: unknown, cookie = "", method = body === undefined ? "GET" : "POST") {
  const response = await app.handle(new Request(`${config.BETTER_AUTH_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", origin: new URL(config.BETTER_AUTH_URL).origin, cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
  if (response.status !== expected) throw new Error(`${path}: expected ${expected}, received ${response.status}: ${await response.text()}`);
  console.log(`PASS ${path} → ${expected}`);
  return { data: await response.json(), cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") };
}
try {
  await db.$queryRaw`SELECT 1`;
} catch {
  await db.$disconnect();
  throw new Error("Integration checks require the configured PostgreSQL server to be running. No test records were created.");
}
try {
  const admin = await provisionAccount(db, { email: email("admin"), password, firstName: "Integration Test", role: "admin" });
  profiles.push(admin.id);
  const login = await request("/api/auth/sign-in/email", 200, { email: email("admin"), password });
  if (!login.cookie) throw new Error("Login did not issue a session cookie");
  const cookie = login.cookie;
  await request("/api/me", 200, undefined, cookie);
  await checkSession(cookie, admin.id);
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
  await checkSession(studentLogin.cookie, student.profileId);
  await checkSession(teacherLogin.cookie, teacher.profileId);
  const other = await provisionAccount(db, { email: email("other"), password, firstName: "Unassigned Student", role: "student" });
  profiles.push(other.id);
  const studentRows = (await request("/api/students", 200, undefined, studentLogin.cookie)).data;
  if (studentRows.length !== 1 || studentRows[0].id !== student.id) throw new Error("Student list leaked another student");
  await request(`/api/students/${other.student!.id}`, 404, undefined, studentLogin.cookie);
  await request(`/api/students/${other.student!.id}`, 404, undefined, teacherLogin.cookie);
  const teacherRows = (await request("/api/students", 200, undefined, teacherLogin.cookie)).data;
  if (!teacherRows.some((row: { id: string }) => row.id === student.id) || teacherRows.some((row: { id: string }) => row.id === other.student!.id))
    throw new Error("Teacher student visibility does not match assignments");
  const ownEnrollments = (await request("/api/enrollments", 200, undefined, studentLogin.cookie)).data;
  if (!ownEnrollments.some((row: { id: string }) => row.id === enrollment.id) || ownEnrollments.some((row: { studentId: string }) => row.studentId !== student.id))
    throw new Error("Student enrollment visibility is incorrect");
  if (visible.some((row: { teacherId: string }) => row.teacherId !== teacher.id)) throw new Error("Teacher enrollment list leaked another teacher's records");
  await request("/api/teachers", 403, undefined, studentLogin.cookie);
  await request(`/api/students/${student.id}`, 403, { firstName: "Unauthorized" }, teacherLogin.cookie, "PATCH");
  await request("/api/lessons", 200, undefined, cookie);

  // Exercise the actual operator command without putting passwords in arguments.
  await request("/api/me", 200, undefined, studentLogin.cookie);
  const newPassword = crypto.randomUUID() + "Aa1!";
  const reset = Bun.spawn([process.execPath, "run", "account:reset-password"], {
    cwd: new URL("..", import.meta.url).pathname,
    stdin: new Blob([JSON.stringify({ email: email("student"), password: newPassword })]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [resetOutput, , resetExit] = await Promise.all([
    new Response(reset.stdout).text(),
    new Response(reset.stderr).text(),
    reset.exited,
  ]);
  if (resetExit !== 0) throw new Error("Password reset command failed");
  const resetResult = JSON.parse(resetOutput);
  if (resetResult.id !== student.profileId || resetResult.revokedSessions < 1)
    throw new Error("Password reset did not revoke the temporary student's session");
  console.log("PASS operator password reset command");
  await request("/api/me", 401, undefined, studentLogin.cookie);
  console.log("PASS old session rejected after password reset");
  // Better Auth permits three sign-in requests per 10 seconds by default.
  // Earlier role checks use that allowance; keep production rate limiting enabled.
  console.log("Waiting 11 seconds for the login rate-limit window");
  await Bun.sleep(11_000);
  await request("/api/auth/sign-in/email", 401, { email: email("student"), password });
  console.log("PASS old password rejected");
  const recovered = await request("/api/auth/sign-in/email", 200, { email: email("student"), password: newPassword });
  if (!recovered.cookie) throw new Error("Recovered login did not issue a session cookie");
  await request("/api/me", 200, undefined, recovered.cookie);
  console.log("PASS new password and session work");
  await request("/api/me", 200, undefined, cookie);
  console.log("PASS another user's session remains valid");

  console.log("Waiting 11 seconds for the authentication rate-limit window");
  await Bun.sleep(11_000);
  const signup = await request("/api/auth/sign-up/email", 200, {
    name: "Public Student", email: email("public"), password,
    role: "admin", studentId: student.id,
  });
  profiles.push(signup.data.user.id);
  const publicProfile = (await request("/api/me", 200, undefined, signup.cookie)).data;
  if (publicProfile.role !== "student" || !publicProfile.student || publicProfile.student.id === student.id)
    throw new Error("Public signup did not create an independent student profile");
  console.log("PASS signup always creates a student, ignoring supplied privileges");
  const target = `/api/users/${publicProfile.id}/role`;
  await request(target, 401, { role: "manager" }, "", "PATCH");
  await request(target, 403, { role: "manager" }, signup.cookie, "PATCH");
  await request(target, 403, { role: "manager" }, teacherLogin.cookie, "PATCH");
  await request(target, 422, { role: "admin" }, cookie, "PATCH");
  await request(target, 422, { role: "teacher" }, cookie, "PATCH");
  await request(target, 200, { role: "teacher", specialization: "English" }, cookie, "PATCH");
  await request("/api/me", 401, undefined, signup.cookie);
  const promoted = await db.profile.findUniqueOrThrow({ where: { id: publicProfile.id }, include: { student: true, teacher: true } });
  if (promoted.role !== "teacher" || !promoted.teacher || !promoted.student)
    throw new Error("Teacher promotion did not preserve student history");
  await request(target, 409, { role: "manager" }, cookie, "PATCH");
  await request(`/api/users/${student.profileId}/role`, 200, { role: "manager" }, cookie, "PATCH");
  await request("/api/me", 401, undefined, recovered.cookie);
  const managerLogin = await request("/api/auth/sign-in/email", 200, { email: email("student"), password: newPassword });
  const managerProfile = (await request("/api/me", 200, undefined, managerLogin.cookie)).data;
  if (managerProfile.role !== "manager") throw new Error("Manager role was not applied");
  await request(target, 403, { role: "manager" }, managerLogin.cookie, "PATCH");
  await request("/api/teachers", 403, { email: email("denied"), password, firstName: "Denied", specialization: "English" }, managerLogin.cookie);
  console.log("PASS only admins can promote students or create teacher accounts");
  await checkSession(managerLogin.cookie, student.profileId);
  const managerStudents = (await request("/api/students", 200, undefined, managerLogin.cookie)).data;
  if (!managerStudents.some((row: { id: string }) => row.id === other.student!.id)) throw new Error("Manager cannot read school students");
  await checkLogout(managerLogin.cookie);
  await checkLogout(teacherLogin.cookie);
  await checkLogout(cookie);
  console.log("Waiting 11 seconds for the login rate-limit window");
  await Bun.sleep(11_000);
  const finalStudentLogin = await request("/api/auth/sign-in/email", 200, { email: email("other"), password });
  await checkSession(finalStudentLogin.cookie, other.id);
  await db.session.updateMany({ where: { userId: other.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  await request("/api/me", 401, undefined, finalStudentLogin.cookie);
  const expiredSession = (await request("/api/auth/get-session", 200, undefined, finalStudentLogin.cookie)).data;
  if (expiredSession !== null) throw new Error("Expired session is still valid");
  console.log("PASS expired sessions are rejected");
  const freshStudentLogin = await request("/api/auth/sign-in/email", 200, { email: email("other"), password });
  await checkLogout(freshStudentLogin.cookie);
  console.log("PASS session restoration and logout for all four roles");
} finally {
  await db.$transaction(async tx => {
    if (courseId) {
      await tx.enrollment.deleteMany({ where: { courseId } });
      await tx.course.delete({ where: { id: courseId } });
    }
    await tx.student.deleteMany({ where: { profileId: { in: profiles } } });
    await tx.teacher.deleteMany({ where: { profileId: { in: profiles } } });
    await tx.admin.deleteMany({ where: { profileId: { in: profiles } } });
    await tx.manager.deleteMany({ where: { profileId: { in: profiles } } });
    await tx.user.deleteMany({ where: { id: { in: profiles } } });
  });
  await db.$disconnect();
  console.log("Temporary test records removed");
}
