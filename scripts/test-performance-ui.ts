// Browser integration checks against isolated API fixtures; run after mobile:export.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { defaultWeights, emptyAssessment } from "../src/shared/performance";
const root = path.resolve(process.env.PERFORMANCE_UI_DIR || "mobile/dist-notification-review");
const output = path.join(root, "qa"); fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  const file = path.resolve(root, "." + new URL(req.url || "/", "http://localhost").pathname);
  if (!file.startsWith(root + path.sep) && file !== root) return void res.writeHead(403).end();
  const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(root, "index.html");
  res.setHeader("Content-Type", target.endsWith(".js") ? "application/javascript" : target.endsWith(".ttf") ? "font/ttf" : "text/html"); fs.createReadStream(target).pipe(res);
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address() as { port: number };
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const role of ["admin", "teacher", "student"] as const) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage(); const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    const writes: { path: string; body: any }[] = [];
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baku", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const assessment = emptyAssessment(); assessment.speaking = [4,4,4,4]; assessment.vocabulary.earned = 14; assessment.listening.earned = 9; assessment.sentenceStructure.earned = 15;
    const data = { weights: { ...defaultWeights }, enrollments: [{ id: "enrollment", courseId: "course", studentId: "student", course: { name: "Everyday English" }, student: { id: "student", performanceLevel: "B1", profile: { firstName: "Aylin", lastName: "Mammadova" } } }], evaluations: [{ id: "evaluation", studentId: "student", lessonId: "lesson", topic: "Everyday experiences", assessment, lesson: { date: today, enrollmentId: "enrollment" } }] };
    await page.route("**/api/**", async route => {
      const request = route.request(), endpoint = new URL(request.url()).pathname;
      const reply = (body: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
      if (request.method() === "OPTIONS") return reply({});
      if (endpoint === "/api/auth/get-session") return reply({ session: { id: "session", userId: "self", expiresAt: "2099-01-01T00:00:00Z" }, user: { id: "self", name: "Test Account", email: "test@example.test" } });
      if (endpoint === "/api/me") return reply({ id: "self", firstName: "Test", lastName: "Student", role });
      if (request.method() === "PUT" || request.method() === "PATCH") {
        const body = request.postDataJSON(); writes.push({ path: endpoint, body });
        if (endpoint.endsWith("/weights")) data.weights = body;
        if (endpoint.endsWith("/level")) data.enrollments[0].student.performanceLevel = body.level;
        if (endpoint.endsWith("/lessons/lesson")) Object.assign(data.evaluations[0], body);
        return reply(body);
      }
      if (endpoint === "/api/performance") return reply(data);
      if (endpoint === "/api/performance/students/student/lessons") return reply([{ id: "lesson", date: today, enrollment: { course: { name: "Everyday English" } } }]);
      if (endpoint === "/api/notifications/unread-count") return reply({ count: 0 });
      if (endpoint.endsWith("/reschedule-requests")) return reply([]);
      return reply([]);
    });
    await page.goto(`http://127.0.0.1:${address.port}`);
    if (role === "student") {
      await page.getByRole("button", { name: "Open profile", exact: true }).click();
      await page.getByText("Test Student", { exact: true }).waitFor();
      await page.screenshot({ path: path.join(output, "student-profile-mobile.png") });
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("button", { name: "Account settings", exact: true }).click();
      await page.getByRole("textbox", { name: "Phone number", exact: true }).fill("+994 (50) 123-45-67");
      await page.getByRole("button", { name: "Save phone number", exact: true }).click();
      await page.getByText("Phone number updated.", { exact: true }).waitFor();
      assert.equal(writes.at(-1)?.body.phone, "+994501234567");
      await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
      await page.getByRole("button", { name: "Back to settings", exact: true }).click();
      await page.getByRole("button", { name: "Billing & subscriptions", exact: true }).click();
      await page.getByRole("button", { name: "Back to settings", exact: true }).click();
      await page.getByRole("button", { name: "Back to profile", exact: true }).click();
      await page.getByRole("button", { name: "This week", exact: true }).waitFor();
      await page.getByRole("button", { name: "This month", exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Analytics", exact: true }).count(), 0);
    } else await page.getByRole("button", { name: "Analytics / Performance", exact: true }).click();
    await page.getByText(role === "admin" ? "Set the standard." : role === "teacher" ? "A clear view of every learner." : "Your learning, in focus.", { exact: true }).waitFor();
    const noOverflow = async () => assert(await page.evaluate(() => [...document.querySelectorAll('input, [role="button"]')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height; }).every(e => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; })), "Mobile controls must fit viewport");
    await noOverflow();
    await page.screenshot({ path: path.join(output, `performance-${role}-mobile.png`) });
    if (role === "admin") {
      assert.equal(await page.getByText("Performance weights", { exact: true }).count(), 0);
      await page.getByRole("button", { name: "Student name", exact: true }).click();
      await page.getByRole("button", { name: "Aylin Mammadova", exact: true }).click();
      await page.getByRole("button", { name: "Assign class · student level", exact: true }).click();
      await page.getByRole("button", { name: "B2", exact: true }).click();
      await page.getByRole("button", { name: "Save level", exact: true }).click();
      await page.getByText("Student level saved.", { exact: true }).waitFor();
      assert.equal(writes.at(-1)?.body.level, "B2");
    } else if (role === "teacher") {
      assert.equal(await page.getByText(/Drafts|Published/).count(), 0);
      await page.getByRole("textbox", { name: "Speaking %", exact: true }).fill("40");
      assert(await page.getByRole("button", { name: "Save scoring weights", exact: true }).isDisabled());
      await page.getByRole("textbox", { name: "Vocabulary %", exact: true }).fill("20");
      await page.getByRole("button", { name: "Save scoring weights", exact: true }).click();
      await page.getByText("Scoring weights saved. New evaluations will use these weights.", { exact: true }).waitFor();
      await page.getByRole("button", { name: "View Aylin Mammadova", exact: true }).click();
      await page.getByRole("button", { name: "Adjust score", exact: true }).click();
      await page.getByText("Evaluate this lesson.", { exact: true }).waitFor();
      await noOverflow();
      await page.screenshot({ path: path.join(output, "performance-evaluation-mobile.png") });
      await page.getByRole("textbox", { name: "Vocabulary points earned", exact: true }).fill("99");
      assert(await page.getByRole("button", { name: "Save score changes", exact: true }).isDisabled());
      await page.getByRole("textbox", { name: "Vocabulary points earned", exact: true }).fill("18");
      await page.getByRole("textbox", { name: "Feedback for the student", exact: true }).fill("Confident speaking. Keep practising new words.");
      await page.getByRole("button", { name: "Save score changes", exact: true }).click();
      await page.getByText("Lesson history", { exact: true }).waitFor();
      assert.equal(writes.at(-1)?.body.assessment.vocabulary.earned, 18);
      assert.equal(writes.at(-1)?.body.assessment.weights.speaking, 35, "Existing evaluation keeps weight snapshot");
    } else {
      await page.getByText("79", { exact: false }).first().waitFor();
      data.evaluations[0].lesson.date = "2099-11-18";
      data.evaluations[0].topic = "Future-dated saved assessment";
      await page.reload();
      await page.getByRole("button", { name: "Open profile", exact: true }).click();
      await page.getByText("Future-dated saved assessment", { exact: true }).first().waitFor();
      await page.getByText("79/100", { exact: false }).first().waitFor();
      await page.getByRole("button", { name: "This week", exact: true }).click();
      assert.equal(await page.getByText("Future-dated saved assessment", { exact: true }).count(), 1);
      await page.getByRole("button", { name: "All results", exact: true }).click();
      await page.getByText("Future-dated saved assessment", { exact: true }).first().waitFor();
      data.evaluations[0].topic = "Updated teacher feedback";
      await page.getByText("Updated teacher feedback", { exact: true }).first().waitFor({ timeout: 25000 });
      await page.getByRole("button", { name: "This month", exact: true }).click();
      await page.getByRole("button", { name: "How scoring works ↗", exact: true }).click();
      await page.getByText("Assessment principles", { exact: true }).waitFor();
      await page.setViewportSize({ width: 1024, height: 900 });
      await page.screenshot({ path: path.join(output, "performance-student-desktop.png") });
      data.evaluations.splice(0); data.enrollments.splice(0);
      await page.reload();
      await page.getByRole("button", { name: "Open profile", exact: true }).click();
      await page.getByText("Ready to aim for the highest score?", { exact: true }).waitFor();
      assert.equal(await page.getByText("Example score · your potential", { exact: true }).count(), 4);
      await page.setViewportSize({ width: 390, height: 844 });
      await noOverflow();
      await page.screenshot({ path: path.join(output, "student-preview-mobile.png") });
      await page.getByRole("button", { name: "Explore courses →", exact: true }).click();
      await page.getByText("Available courses", { exact: true }).waitFor();
    }
    assert.deepEqual(errors, []); console.log(`PASS ${role}: mobile layout and performance interactions`); await context.close();
  }
} finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
