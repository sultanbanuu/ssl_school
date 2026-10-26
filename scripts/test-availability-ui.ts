// Browser contract tests against isolated API fixtures; no live school data is changed.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { addDays, dayNumber } from "../src/scheduling";
const root = path.resolve("mobile/dist-notification-review");
const output = path.resolve("dist/availability-qa");
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  let role = "teacher", conflict = false;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baku", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const monday = addDays(today, -((new Date(dayNumber(today)).getUTCDay() + 6) % 7)), nextWeek = addDays(monday, 7);
  const teachers = [{ id: "teacher", profile: { firstName: "Sara", lastName: "Wilson" } }, { id: "teacher2", profile: { firstName: "James", lastName: "Carter" } }];
  const courses = [{ id: "course", teacherId: "teacher", name: "General English", active: true }, { id: "course2", teacherId: "teacher2", name: "IELTS", active: true }];
  const slots: any[] = [], trials: any[] = [], writes: any[] = [];
  const hydrate = (slot: any) => ({ ...slot, teacher: teachers.find(t => t.id === slot.teacherId), course: courses.find(c => c.id === slot.courseId) });
  await page.route("**/api/**", async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    const reply = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (req.method() === "OPTIONS") return reply({});
    if (path === "/api/auth/get-session") return reply({ session: { id: "session", userId: "self", expiresAt: "2099-01-01T00:00:00Z" }, user: { id: "self", email: "test@example.test" } });
    if (path === "/api/me") return reply({ id: "self", firstName: "New", role });
    if (path === "/api/notifications/unread-count") return reply({ count: 0 });
    if (path === "/api/teachers") return reply(role === "teacher" ? teachers.slice(0, 1) : teachers);
    if (path === "/api/courses") return reply(role === "teacher" ? courses.slice(0, 1) : courses);
    if (path === "/api/availability" && req.method() === "GET") {
      const items = slots.filter(s => s.active && (role !== "teacher" || s.teacherId === "teacher") && s.startsAt.slice(0, 10) >= url.searchParams.get("from")! && s.startsAt.slice(0, 10) <= url.searchParams.get("to")!).flatMap(s => {
        const reservation = trials.find(t => t.slot.id === s.id && ["pending", "approved"].includes(t.status));
        return role === "student" && reservation ? [] : [{ ...hydrate(s), ...(role === "student" ? {} : { reservation }) }];
      }); return reply({ items, hasMore: false });
    }
    if (path.startsWith("/api/availability") && req.method() !== "GET") {
      const body = req.postDataJSON(); writes.push({ path, body });
      const data = body.active === false ? { active: false } : { teacherId: body.teacherId, courseId: body.courseId, startsAt: new Date(`${body.date}T${body.startTime}:00+04:00`).toISOString(), endsAt: new Date(`${body.date}T${body.endTime}:00+04:00`).toISOString() };
      if (req.method() === "POST") { const row = { id: `slot-${slots.length}`, active: true, ...data }; slots.push(row); return reply(hydrate(row), 201); }
      const row = slots.find(s => path.endsWith("/" + s.id)); Object.assign(row, data); return reply(hydrate(row));
    }
    if (path === "/api/trial-requests" && req.method() === "GET") return reply(trials.filter(t => role !== "teacher" || t.slot.teacherId === "teacher"));
    if (path === "/api/trial-requests" && req.method() === "POST") {
      if (conflict) return reply({ error: "This time is no longer available" }, 409);
      const body = req.postDataJSON(); writes.push({ path, body });
      const row = { id: `trial-${trials.length}`, status: "pending", slot: hydrate(slots.find(s => s.id === body.slotId)), student: { profile: { firstName: "Aylin", lastName: "Aliyeva" } } }; trials.push(row); return reply(row, 201);
    }
    if (path.startsWith("/api/trial-requests/") && req.method() === "PATCH") {
      const body = req.postDataJSON(); writes.push({ path, body }); const row = trials.find(t => path.endsWith("/" + t.id)); Object.assign(row, body); return reply(row);
    }
    if (req.method() !== "GET") writes.push({ path });
    return reply([]);
  });
  const address = server.address() as { port: number };
  await page.goto(`http://127.0.0.1:${address.port}`);
  const openAvailability = async () => { await page.getByRole("button", { name: "Teacher Availability", exact: true }).click(); await page.getByRole("heading", { name: "Teacher Availability", exact: true }).waitFor(); await page.getByRole("button", { name: "Next availability week", exact: true }).click(); };
  await openAvailability();
  const day = (await page.locator(`[data-availability-date="${nextWeek}"]`).boundingBox())!;
  await page.mouse.move(day.x + 40, day.y + 120); await page.mouse.down(); await page.mouse.move(day.x + 40, day.y + 210, { steps: 8 }); await page.mouse.up();
  await page.getByRole("heading", { name: "Publish trial availability", exact: true }).waitFor();
  assert.equal(await page.getByLabel("Availability teacher", { exact: true }).inputValue(), "teacher");
  assert.equal(await page.getByLabel("Availability date", { exact: true }).inputValue(), nextWeek);
  assert.equal(await page.getByRole("slider", { name: "Start time", exact: true }).inputValue(), "720");
  await page.getByLabel("Trial course", { exact: true }).selectOption("course");
  await page.getByRole("button", { name: "Publish availability", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(slots.length, 1); assert.equal(writes[0].body.endTime, "13:30");
  console.log("PASS teacher publishes a trial slot by dragging the shared weekly calendar");
  const card = page.locator('[data-slot-id="slot-0"]'); const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + 25, box.y + 15); await page.mouse.down(); await page.mouse.move(box.x + 185, box.y + 45, { steps: 10 }); await page.mouse.up();
  await page.getByRole("heading", { name: "Edit availability", exact: true }).waitFor();
  assert.equal(await page.getByLabel("Availability date", { exact: true }).inputValue(), addDays(nextWeek, 1));
  await page.getByRole("button", { name: "Save availability", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(writes.at(-1).body.startTime, "12:30");
  console.log("PASS teacher reschedules a slot with drag and confirmation");
  const resized = (await card.boundingBox())!;
  assert(resized.width < 160);
  await page.mouse.move(resized.x + 30, resized.y + resized.height - 3); await page.mouse.down(); await page.mouse.move(resized.x + 30, resized.y + resized.height + 27, { steps: 8 }); await page.mouse.up();
  await page.getByRole("heading", { name: "Edit availability", exact: true }).waitFor();
  await page.getByRole("button", { name: "Save availability", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(writes.at(-1).body.endTime, "14:30");
  console.log("PASS slot cards stay in their day column and resize in 15-minute steps");
  await page.screenshot({ path: path.join(output, "teacher-availability.png"), fullPage: true });
  role = "student"; await page.reload();
  await page.getByRole("button", { name: "Request a trial lesson", exact: true }).waitFor();
  await openAvailability();
  assert.equal(await page.getByRole("button", { name: "+ Add availability", exact: true }).count(), 0);
  assert.equal(await page.locator(".appointment-calendar").count(), 1);
  assert.equal(await page.locator(".availability-grid").count(), 0);
  await page.screenshot({ path: path.join(output, "student-available-times.png"), fullPage: true });
  await card.click(); await page.getByRole("heading", { name: "Request a trial lesson", exact: true }).waitFor();
  conflict = true;
  await page.getByRole("button", { name: "Request trial lesson", exact: true }).click(); await page.getByRole("alert").filter({ hasText: "no longer available" }).waitFor();
  assert.equal(trials.length, 0); conflict = false;
  await page.getByRole("button", { name: "Request trial lesson", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("Awaiting approval", { exact: true }).waitFor(); assert.equal(await card.count(), 0);
  assert.equal(writes.some(w => w.path === "/api/enrollments"), false);
  console.log("PASS new student requests without enrollment; stale slots show errors and successful requests become pending");
  await page.screenshot({ path: path.join(output, "student-trial-request.png"), fullPage: true });
  role = "teacher"; await page.reload(); await openAvailability();
  await page.getByRole("button", { name: "Approve trial", exact: true }).click(); await page.getByText("Confirmed", { exact: true }).waitFor();
  assert.equal(trials[0].status, "approved");
  console.log("PASS teacher approves a pending trial; confirmed status is visible");
  role = "admin"; await page.reload(); await openAvailability();
  await page.getByRole("button", { name: "+ Add availability", exact: true }).click();
  await page.getByLabel("Availability teacher", { exact: true }).selectOption("teacher2");
  await page.getByLabel("Trial course", { exact: true }).selectOption("course2");
  await page.getByLabel("Availability date", { exact: true }).fill(addDays(nextWeek, 2));
  await page.getByRole("button", { name: "Publish availability", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(slots[1].teacherId, "teacher2");
  console.log("PASS admin manages another teacher using the same calendar and editor");
  role = "student"; await page.reload(); await openAvailability();
  await page.getByText("Confirmed", { exact: true }).waitFor();
  page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "Cancel trial", exact: true }).click();
  await page.getByText("cancelled", { exact: true }).waitFor(); await card.waitFor();
  assert.equal(trials[0].status, "cancelled");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(output, "availability-mobile.png"), fullPage: true });
  console.log("PASS student cancellation releases the slot; narrow layout stays contained");
  assert.deepEqual(errors, []);
  console.log("Teacher Availability browser checks passed.");
} finally { await browser.close(); server.close(); }
