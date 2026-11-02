import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
const root = path.resolve("mobile/dist-notification-review");
const server = http.createServer((req, res) => {
  const file = path.resolve(root, "." + new URL(req.url!, "http://localhost").pathname);
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end(); return; }
  const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(root, "index.html");
  res.setHeader("Content-Type", target.endsWith(".js") ? "application/javascript" : target.endsWith(".ttf") ? "font/ttf" : "text/html"); fs.createReadStream(target).pipe(res);
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  let role = "student", used = 2;
  let request: any = null;
  const lesson: any = { id: "lesson", teacherId: "teacher", enrollmentId: "enrollment", date: "2099-11-04", endDate: "2099-11-04", startTime: "14:00", endTime: "15:00", status: "scheduled", enrollment: { studentId: "student", courseId: "course", course: { name: "Everyday English" }, student: { profile: { firstName: "Lina", lastName: "Test" } } }, teacher: { profile: { firstName: "Emma", lastName: "Smith" } } };
  const slot = { id: "2099-11-05T11:00:00.000Z", startsAt: "2099-11-05T15:00:00+04:00", endsAt: "2099-11-05T18:00:00+04:00" };
  const calls: string[] = [], errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/api/**", async route => {
    const endpoint = new URL(route.request().url()).pathname, method = route.request().method();
    calls.push(`${method} ${endpoint}`);
    let data: unknown = [];
    if (endpoint === "/api/auth/get-session") data = { session: { id: "session", userId: "self", expiresAt: "2099-01-01T00:00:00Z" }, user: { id: "self", name: "Lina", email: "test@example.test" } };
    if (endpoint === "/api/me") data = { id: "self", firstName: "Lina", role };
    if (endpoint === "/api/courses") data = [{ id: "course", name: "Everyday English", price: "120", active: true, teacherId: "teacher" }];
    if (endpoint === "/api/enrollments") data = [{ id: "enrollment", studentId: "student", teacherId: "teacher", courseId: "course", createdAt: new Date().toISOString(), course: { name: "Everyday English" }, student: lesson.enrollment.student }];
    if (endpoint === "/api/teachers") data = [{ id: "teacher", profile: { firstName: "Emma", lastName: "Smith" } }];
    if (endpoint === "/api/scheduling-students" || endpoint === "/api/students") data = [{ id: "student", status: "active", profile: { firstName: "Lina", lastName: "Test" } }];
    if (endpoint === "/api/notifications/unread-count") data = { count: 0 };
    if (endpoint === "/api/lessons") data = [{ ...lesson, rescheduleRequests: request ? [{ status: request.status }] : [] }];
    if (endpoint.endsWith("/reschedule-options")) data = { items: [slot], lessonMinutes: 60, scheduleConfigured: true, from: "2099-11-02", to: "2099-11-08", pending: request?.status === "pending" ? request : null, hasMore: false, nextOffset: 7, quota: { used, limit: 3, remaining: Math.max(0, 3 - used), resetsAt: "2099-12-01T00:00:00+04:00" } };
    if (endpoint === "/api/lessons/lesson/reschedule-requests") { const start = route.request().postDataJSON().startsAt; assert.equal(start, "2099-11-05T12:00:00.000Z"); request = { id: "request", status: "pending", startsAt: start, endsAt: new Date(Date.parse(start) + 3600000).toISOString(), originalStart: "2099-11-04T14:00:00+04:00", originalEnd: "2099-11-04T15:00:00+04:00", lesson, quotaWaived: false }; used++; data = request; }
    if (endpoint === "/api/reschedule-requests") data = request ? [request] : [];
    if (endpoint === "/api/reschedule-availability") data = method === "GET" ? [slot] : slot;
    if (endpoint === "/api/reschedule-requests/request" && method === "PATCH") { request.status = route.request().postDataJSON().status; if (request.status === "approved") Object.assign(lesson, { date: "2099-11-05", endDate: "2099-11-05", startTime: "16:00", endTime: "17:00", rescheduledAt: new Date().toISOString() }); data = request; }
    if (endpoint === "/api/lessons/lesson/cancel") { lesson.status = "cancelled"; lesson.cancelledByStudent = true; data = lesson; }
    if (endpoint === "/api/student-cancellations") data = lesson.status === "cancelled" ? [lesson] : [];
    if (endpoint === "/api/lessons/lesson/restore") { lesson.status = "scheduled"; lesson.cancelledByStudent = false; data = lesson; }
    if (endpoint === "/api/reschedule-requests/request/quota") { request.quotaWaived = true; used--; data = request; }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
  });
  const address = server.address() as { port: number };
  await page.goto(`http://127.0.0.1:${address.port}`);
  async function manage() {
    await page.getByRole("tab", { name: "Lesson", exact: true }).click();
    await page.getByTestId("student-lesson-lesson").click();
    await page.getByRole("button", { name: "Manage lesson", exact: true }).click();
  }
  await manage();
  await page.getByText("Teacher’s available times", { exact: true }).waitFor();
  assert.equal(await page.getByText("15-minute trial opening", { exact: true }).count(), 0);
  // A calendar change becomes visible without a refresh click or navigation.
  slot.endsAt = "2099-11-05T19:00:00+04:00";
  await page.getByRole("button", { name: "Show more openings (1)", exact: true }).waitFor({ timeout: 22000 });
  await page.getByText("Reschedule lesson", { exact: true }).click();
  await page.getByRole("radio", { name: /16:00–17:00/ }).click();
  await page.getByRole("button", { name: "Send reschedule request", exact: true }).click();
  await page.getByText(/Reschedule pending:/).waitFor();
  assert.equal(used, 3);
  role = "teacher"; await page.reload();
  await page.getByRole("button", { name: /Rescheduling requests/ }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByText("Status: approved", { exact: true }).waitFor();
  role = "student"; await page.reload(); await manage();
  await page.getByText("Monthly limit reached", { exact: true }).waitFor();
  await page.getByText("Cancel lesson", { exact: true }).click();
  await page.getByRole("button", { name: "Confirm cancellation", exact: true }).click();
  await page.getByText(/This lesson is cancelled/).waitFor();
  role = "admin"; await page.reload();
  await page.getByRole("button", { name: /Rescheduling requests/ }).click();
  await page.getByLabel("Review note for request").fill("Student selected the wrong date by mistake");
  await page.getByRole("button", { name: "Exclude mistaken request from limit", exact: true }).click();
  await page.getByText(/excluded from monthly limit/).waitFor();
  await page.getByRole("button", { name: "Restore cancelled lesson", exact: true }).click();
  await page.getByText("No student cancellations.", { exact: true }).waitFor();
  role = "student"; await page.reload(); await manage();
  await page.getByText(/2 of 3 rescheduling requests/).waitFor();
  await page.getByRole("tab", { name: "Lesson details", exact: true }).click();
  await page.getByText("Rescheduled", { exact: true }).waitFor();
  assert(calls.includes("PATCH /api/reschedule-requests/request"));
  assert(calls.includes("POST /api/lessons/lesson/cancel"));
  assert(calls.includes("POST /api/lessons/lesson/restore"));
  assert.deepEqual(errors, []);
  fs.mkdirSync(path.join(root, "qa"), { recursive: true });
  await page.screenshot({ path: path.join(root, "qa/rescheduled-lesson.png") });
  console.log("PASS student availability request, teacher approval, updated card status, cancellation at quota, admin quota correction and cancellation restore");
} finally { await browser.close(); server.close(); }
