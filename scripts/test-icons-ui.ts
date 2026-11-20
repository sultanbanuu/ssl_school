import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

// Isolated fixtures exercise the student shell without touching school records.
const root = path.resolve(process.env.ICON_UI_DIR || "mobile/dist-notification-review");
const server = http.createServer((req, res) => {
  const file = path.resolve(root, "." + new URL(req.url!, "http://localhost").pathname);
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end(); return; }
  const target = !file.includes(`${path.sep}node_modules${path.sep}`) && fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(root, "index.html");
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
    if (endpoint === "/api/courses") data = [{ id: "english", name: "Upgrade Your Level", price: "120.00" }, { id: "speaking", name: "Lean Leader", price: "150.00" }];
    if (endpoint === "/api/enrollments") data = [{ courseId: "english", createdAt: new Date(Date.now() - 6 * 86400000).toISOString() }];
    if (endpoint === "/api/lessons") data = Array.from({ length: 4 }, (_, i) => ({ id: String(i), date: "2099-11-0" + (i + 1), startTime: "14:00", endTime: "15:00", status: "scheduled", enrollment: { course: { name: "English session " + (i + 1) } }, teacher: { profile: { firstName: "Emma", lastName: "Smith" } } }));
    if (endpoint === "/api/notifications/unread-count") data = { count: 0 };
    if (endpoint.endsWith("/reschedule-options")) data = { items: [], hasMore: false, nextOffset: 30, quota: { used: 0, remaining: 3, limit: 3, resetsAt: "2099-12-01T00:00:00+04:00" }, pending: null };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
  });
  const address = server.address() as { port: number };
  await page.goto(process.env.ICON_UI_URL || `http://127.0.0.1:${address.port}`);
  await page.getByText("Upgrade Your Level", { exact: true }).waitFor();
  await page.waitForFunction(() => [...document.fonts].some(font => font.family === 'ionicons' && font.status === 'loaded'));
  const icons = page.locator('[style*="font-family: ionicons"]');
  assert(await icons.count() >= 10, 'Student icons render without serving node_modules assets');
  for (const label of ['Today', 'Lesson', 'Profile']) {
    const icon = page.getByRole('tab', { name: label, exact: true }).locator('[data-testid^="school-icon-"]');
    await icon.waitFor({ state: 'visible' });
    const box = await icon.boundingBox();
    assert(box && box.width > 0 && box.height > 0, `${label} icon has visible dimensions`);
    assert(await icon.locator('img').evaluateAll(images => images.every(image =>
      (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)), `${label} SVG images load`);
  }
  assert.deepEqual(errors, []);
  fs.mkdirSync('tmp', {recursive:true});
  await page.screenshot({path: 'tmp/icons-fixed.png'});
  console.log('PASS: icon font and navigation icons render when node_modules assets are excluded');
} finally { await browser.close(); server.close(); }
