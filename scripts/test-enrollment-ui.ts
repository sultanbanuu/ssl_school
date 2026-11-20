// Browser contract tests against isolated API fixtures; no live school data is changed.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { addDays, dayNumber } from "../src/scheduling";
const root = path.resolve("mobile/dist-notification-review");
const output = path.resolve("dist/calendar-qa");
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  const file = path.resolve(root, "." + new URL(req.url || "/", "http://localhost").pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(200, { "Content-Type": "text/html" }); fs.createReadStream(path.join(root, "index.html")).pipe(res); return; }
  const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(root, "index.html");
  res.setHeader("Content-Type", target.endsWith(".js") ? "application/javascript" : "text/html"); fs.createReadStream(target).pipe(res);
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baku", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const monday = addDays(today, -((new Date(dayNumber(today)).getUTCDay() + 6) % 7));
  const enrollment = { id: "enrollment", teacherId: "teacher", courseId: "course", studentId: "student", course: { name: "General English" }, student: { profile: { firstName: "Aylin", lastName: "Aliyeva" } } };
  const teachers = [{ id: "teacher", profile: { firstName: "Sara", lastName: "Wilson" } }, { id: "teacher2", profile: { firstName: "James", lastName: "Carter" } }];
  const students = Array.from({ length: 101 }, (_, i) => ({
    id: i ? "student" + i : "student",
    status: "active",
    profile: i ? { firstName: "Student", lastName: String(i) } : {
      ...enrollment.student.profile,
      user: { email: "aylin@example.test", emailVerified: true },
    },
  }));
  const courses = [{ id: "course", name: "General English", active: true, teacherId: "teacher" }, { id: "course2", name: "IELTS preparation", active: true, teacherId: "teacher2" }, { id: "course3", name: "New course", active: true, teacherId: "teacher2" }];
  teachers.push({ id: "teacher3", profile: { firstName: "New", lastName: "Teacher" } });
  const enrollments: any[] = [enrollment];
  const enrollmentWrites: any[] = [];
  const rows: any[] = [
    { id: "lesson-1", date: monday, endDate: monday, startTime: "10:00", endTime: "11:00", status: "scheduled", allDay: false, enrollment, teacherId: "teacher", teacher: { profile: { firstName: "Sara", lastName: "Wilson" } }, reminderMinutes: 15 },
    { id: "lesson-2", date: addDays(monday, 2), endDate: addDays(monday, 2), startTime: "11:00", endTime: "12:30", status: "scheduled", allDay: false, enrollment: { ...enrollment, id: "enrollment2", courseId: "course2", course: { name: "IELTS preparation" } }, teacherId: "teacher2", teacher: { profile: { firstName: "James", lastName: "Carter" } }, seriesId: "series", repeatRule: { frequency: "weekly", interval: 1, until: addDays(monday, 28) } },
  ];
  const mutations: any[] = []; let conflict = false; let role = "admin";
  const earlierFor = (lesson: any) => rows.filter(row => row.id !== lesson.id && row.enrollment.id === lesson.enrollment.id && row.status === "scheduled" && `${row.date}T${row.startTime}` < `${lesson.date}T${lesson.startTime}` && new Date(`${row.endDate || row.date}T${row.endTime || "23:59"}:00+04:00`).getTime() <= Date.now());
  await page.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url());
    const reply = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (request.method() === "OPTIONS") return reply({});
    if (url.pathname === "/api/auth/get-session") return reply({ session: { id: "session", userId: "self", expiresAt: "2099-01-01T00:00:00Z" }, user: { id: "self", name: "Test", email: "test@example.test" } });
    if (url.pathname === "/api/me") return reply({ id: "self", firstName: "Test", role });
    if (url.pathname === "/api/notifications/unread-count") return reply({ count: 0 });
    if (url.pathname === "/api/enrollments") {
      if (request.method() === "POST") { const body = request.postDataJSON(); enrollmentWrites.push(body); const row = { ...body, id: "new-enrollment", teacherId: "teacher2" }; enrollments.push(row); return reply(row, 201); }
      return reply(enrollments.filter(e => role !== "teacher" || e.teacherId === "teacher"));
    }
    if (url.pathname === "/api/scheduling-students") {
      const offset = Number(url.searchParams.get("offset") || 0);
      return reply(students.slice(offset, offset + 100).map(({ profile, ...student }) => ({
        ...student,
        profile: role === "admin" ? profile : { firstName: profile.firstName, lastName: profile.lastName },
      })));
    }
    if (url.pathname === "/api/courses") return reply(courses);
    if (url.pathname === "/api/teachers") return reply(teachers);
    if (url.pathname.startsWith("/api/lessons")) {
      if (url.pathname.endsWith("/status-options")) { const lesson = rows.find(row => url.pathname.includes(`/${row.id}/`)); return reply({ earlier: earlierFor(lesson), deleteCount: lesson.seriesId ? rows.filter(row => row.seriesId === lesson.seriesId).length : 0, seriesCount: lesson.seriesId ? rows.filter(row => row.seriesId === lesson.seriesId && row.status === "scheduled").length : 0 }); }
      if (request.method() === "GET") return reply(rows.filter(row => (!url.searchParams.has("from") || row.date >= url.searchParams.get("from")!) && (!url.searchParams.has("to") || row.date <= url.searchParams.get("to")!)));
      if (request.method() === "DELETE") { const i = rows.findIndex(row => url.pathname.endsWith("/" + row.id)); const series = rows[i].seriesId; if (url.searchParams.get("scope") === "all" && series) { for (let j = rows.length - 1; j >= 0; j--) if (rows[j].seriesId === series) rows.splice(j, 1); } else rows.splice(i, 1); mutations.push({ method: "DELETE", scope: url.searchParams.get("scope") }); return reply({ deleted: true }); }
      const body = request.postDataJSON(); mutations.push({ method: request.method(), body });
      if (conflict) return reply({ error: "Teacher or student already has a lesson at this time" }, 409);
      if (request.method() === "PATCH") { const row = rows.find(row => url.pathname.endsWith("/" + row.id)); if (body.color !== undefined && row.seriesId) rows.filter(item => item.seriesId === row.seriesId).forEach(item => { item.color = body.color; }); const targets = body.status && body.scope === "all" && row.seriesId ? rows.filter(item => item.seriesId === row.seriesId && item.status === "scheduled") : [row]; if (body.includeEarlier) targets.push(...earlierFor(row)); targets.forEach(item => Object.assign(item, body)); if (body.teacherId) row.teacher = teachers.find(t => t.id === body.teacherId); return reply(row); }
      const row = { ...rows[0], ...body, teacherId: body.teacherId || "teacher", teacher: teachers.find(t => t.id === (body.teacherId || "teacher")), id: "created-" + mutations.length }; rows.push(row); return reply(row, 201);
    }
    return reply([]);
  });
  const address = server.address() as { port: number };
  await page.goto(`http://127.0.0.1:${address.port}`);
  await page.getByRole("heading", { name: "Lesson calendar" }).waitFor();
  const card = () => page.locator('[data-lesson-id="lesson-1"]');
  await card().waitFor();
  assert.equal(await card().locator("strong").textContent(), "Aylin Aliyeva");
  await page.getByRole("button", { name: "Enroll student", exact: true }).click();
  await page.getByRole("button", { name: "Student Select a student", exact: true }).click();
  await page.getByRole("listbox", { name: "Students", exact: true }).getByRole("option", { name: /Aylin Aliyeva/ }).click();
  await page.getByLabel("Course", { exact: true }).selectOption("course3");
  assert.equal(await page.getByLabel("Lesson teacher", { exact: true }).count(), 0);
  const beforeEnrollmentLessons = mutations.length;
  await page.getByRole("button", { name: "Create enrollment", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(enrollmentWrites.at(-1).courseId, "course3");
  assert.equal(mutations.length, beforeEnrollmentLessons);
  await page.getByRole("button", { name: "+ Schedule a lesson", exact: true }).click();
  await page.getByRole("button", { name: "Student Select a student", exact: true }).click();
  await page.getByRole("listbox", { name: "Students", exact: true }).getByRole("option", { name: /Aylin Aliyeva/ }).click();
  await page.getByLabel("Course", { exact: true }).selectOption("course3");
  await page.getByText("Student is enrolled in this course.", { exact: true }).waitFor();
  await page.getByLabel("Lesson teacher", { exact: true }).selectOption("teacher3");
  assert.equal(await page.getByLabel("Lesson teacher", { exact: true }).inputValue(), "teacher3");
  await page.getByRole("button", { name: "Close scheduler" }).click();
  enrollments.pop(); enrollmentWrites.pop();
  console.log("PASS standalone enrollment creates no appointment and allows later teacher selection");
  assert.deepEqual(errors, []);
} finally { await browser.close(); server.close(); }
