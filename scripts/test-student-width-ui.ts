import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

// Isolated fixtures exercise the student shell without touching school records.
const root = path.resolve("mobile/dist-notification-review");
const server = http.createServer((req, res) => {
  const file = path.resolve(root, "." + new URL(req.url!, "http://localhost").pathname);
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end(); return; }
  const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(root, "index.html");
  res.setHeader("Content-Type", target.endsWith(".js") ? "application/javascript" : target.endsWith(".ttf") ? "font/ttf" : "text/html");
  fs.createReadStream(target).pipe(res);
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", async route => {
    const endpoint = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (endpoint === "/api/auth/get-session") data = { session: { id: "session", userId: "self", expiresAt: "2099-01-01T00:00:00Z" }, user: { id: "self", name: "Lina", email: "test@example.test" } };
    if (endpoint === "/api/me") data = { id: "self", firstName: "Lina", role: "student" };
    if (endpoint === "/api/courses") data = [{ id: "english", name: "Everyday English", price: "120.00" }, { id: "speaking", name: "Speak with confidence", price: "150.00" }];
    if (endpoint === "/api/enrollments") data = [{ courseId: "english", createdAt: new Date(Date.now() - 6 * 86400000).toISOString() }];
    if (endpoint === "/api/lessons") data = Array.from({ length: 4 }, (_, i) => ({ id: String(i), date: "2099-11-0" + (i + 1), startTime: "14:00", endTime: "15:00", status: "scheduled", enrollment: { course: { name: "English session " + (i + 1) } }, teacher: { profile: { firstName: "Emma", lastName: "Smith" } } }));
    if (endpoint === "/api/notifications/unread-count") data = { count: 0 };
    if (endpoint.endsWith("/reschedule-options")) data = { items: [], hasMore: false, nextOffset: 30, quota: { used: 0, remaining: 3, limit: 3, resetsAt: "2099-12-01T00:00:00+04:00" }, pending: null };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
  });
  const address = server.address() as { port: number };
  await page.goto(`http://127.0.0.1:${address.port}`);
  await page.getByText("Everyday English", { exact: true }).waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Mobile has no horizontal overflow");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(300);
  const widths = await page.getByText("Available courses", { exact: true }).evaluate(el => { const widths = []; for (let p = el.parentElement; p; p = p.parentElement) widths.push(p.getBoundingClientRect().width); return widths; });
  assert(widths.some(width => Math.abs(width - 1200) < 2), "Desktop content is 1200px wide");
  fs.mkdirSync(path.join(root, "qa"), { recursive: true });
  await page.screenshot({ path: path.join(root, "qa/student-desktop.png") });
  assert.deepEqual(errors, []);
  console.log("PASS mobile overflow and 1200px desktop layout");
} finally { await browser.close(); server.close(); }
