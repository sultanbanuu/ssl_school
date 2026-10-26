// Browser contract tests against isolated API fixtures; no live school data is changed.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { addDays, dayNumber } from "../src/scheduling";
const root = path.resolve("dist/availability-review");
const output = path.resolve("dist/availability-delete-qa");
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
      const body = req.method() === "DELETE" ? { active: false } : req.postDataJSON(); writes.push({ path, body, method: req.method() });
      const data = body.active === false ? { active: false } : { teacherId: body.teacherId, courseId: body.courseId, startsAt: new Date(`${body.date}T${body.startTime}:00+04:00`).toISOString(), endsAt: new Date(`${body.date}T${body.endTime}:00+04:00`).toISOString() };
      if (req.method() === "POST") { const row = { id: `slot-${slots.length}`, active: true, ...data }; slots.push(row); return reply(hydrate(row), 201); }
      const row = slots.find(s => decodeURIComponent(path).endsWith("/" + s.id)); Object.assign(row, data); return reply(hydrate(row));
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
  const seed = (id: string, teacherId = "teacher", courseId = "course") => ({ id, teacherId, courseId, active: true, startsAt: new Date(`${monday}T16:00:00+04:00`).toISOString(), endsAt: new Date(`${monday}T16:15:00+04:00`).toISOString() });
  slots.push(seed("slot-delete"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`http://127.0.0.1:${address.port}`);
  await page.getByRole("button", { name: "Teacher Availability", exact: true }).click();
  await page.getByRole("heading", { name: "Teacher Availability", exact: true }).waitFor();
  await page.getByRole("button", { name: `Show appointments ${monday}`, exact: true }).click();
  const agenda = page.getByTestId(/^appointment-/);
  await agenda.first().waitFor();
  await page.getByRole("button", { name: "Show month calendar", exact: true }).click();
  await page.getByRole("button", { name: `Choose ${monday}`, exact: true }).waitFor();
  await page.getByRole("button", { name: "Next month", exact: true }).click();
  await page.getByRole("button", { name: "Show month calendar", exact: true }).waitFor();
  await page.getByRole("button", { name: "Previous month", exact: true }).click();
  await page.getByRole("button", { name: "Show month calendar", exact: true }).click();
  await page.getByRole("button", { name: `Choose ${monday}`, exact: true }).click();
  await agenda.first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(output, "phone-availability.png"), fullPage: true });
  await page.setViewportSize({ width: 320, height: 740 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: `Show appointments ${monday}`, exact: true }).click();
  await agenda.first().click();
  page.once("dialog", d => d.dismiss());
  await page.getByRole("button", { name: "Delete availability", exact: true }).click();
  assert.equal(writes.length, 0);
  page.once("dialog", d => d.accept());
  await page.getByRole("button", { name: "Delete availability", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("Availability deleted.", { exact: true }).waitFor();
  assert.equal(writes.at(-1).method, "DELETE");
  assert.equal(slots[0].active, false);
  assert.equal(await agenda.count(), 0);
  console.log("PASS phone navigation, no horizontal overflow, cancel confirmation and teacher deletion");
  role = "admin";
  slots.push(seed("auto:teacher2:2099-01-05:16", "teacher2", "course2"));
  await page.reload();
  await page.getByRole("button", { name: "Teacher Availability", exact: true }).click();
  await page.getByRole("button", { name: `Show appointments ${monday}`, exact: true }).click();
  await agenda.first().click();
  page.once("dialog", d => d.accept());
  await page.getByRole("button", { name: "Delete availability", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(writes.at(-1).method, "DELETE");
  assert(writes.at(-1).path.includes("auto%3A"));
  console.log("PASS admin deletion of another teacher's generated slot");
  slots.push(seed("desktop-slot"));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await page.getByRole("button", { name: "Teacher Availability", exact: true }).click();
  await page.getByTestId("appointment-desktop-slot").waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(output, "desktop-availability.png"), fullPage: true });
  assert.deepEqual(errors, []);
  console.log("PASS desktop calendar layout and no browser errors");
} finally { await browser.close(); server.close(); }
