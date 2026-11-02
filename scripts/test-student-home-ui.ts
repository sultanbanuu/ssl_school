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
  const tabLabels = await page.getByRole("tab").allTextContents();
  assert.equal(tabLabels.length, 4);
  tabLabels.forEach((text, i) => assert(text.endsWith(["Today", "Lesson", "Games", "Profile"][i]!)));
  assert.equal(await page.getByText(/English session/).count(), 3);
  await page.getByLabel("7 days enrolled", { exact: true }).waitFor();
  await page.getByText("A little change, every day", { exact: true }).click();
  await page.getByText("something you do regularly", { exact: true }).waitFor();
  fs.mkdirSync(path.join(root, "qa"), { recursive: true });
  await page.screenshot({ path: path.join(root, "qa/student-today.png") });
  await page.getByRole("tab", { name: "Profile", exact: true }).click();
  assert.equal(await page.getByLabel("Open profile", { exact: true }).count(), 0);
  await page.getByText("Payments", { exact: true }).waitFor();
  // The moving glass selection must settle over the selected tab.
  await page.waitForFunction(() => {
    const pill = document.querySelector('[data-testid="glass-selection"]')?.getBoundingClientRect();
    const tab = document.querySelector('[role="tab"][aria-label="Profile"]')?.getBoundingClientRect();
    return pill && tab && Math.abs(pill.x - tab.x) < 2 && Math.abs(pill.width - tab.width) < 2;
  });
  await page.getByRole("tab", { name: "Lesson", exact: true }).click();
  await page.getByText("Your lessons", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "Lessons", exact: true }).waitFor();
  await page.getByTestId("student-lesson-0").click();
  await page.getByText("Baku · UTC+4", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(root, "qa/student-lesson-details.png") });
  await page.getByRole("button", { name: "Manage lesson", exact: true }).click();
  await page.getByText("Reschedule lesson", { exact: true }).waitFor();
  await page.getByText("Cancel lesson", { exact: true }).click();
  await page.getByRole("button", { name: "Confirm cancellation", exact: true }).waitFor();
  await page.screenshot({ path: path.join(root, "qa/student-lesson-manage.png") });
  await page.getByRole("button", { name: "Back to lesson", exact: true }).click();
  await page.getByRole("button", { name: "Back to lessons", exact: true }).click();
  await page.getByText("Your lessons", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(root, "qa/student-lessons.png") });
  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  await page.getByRole("tab", { name: "Games", exact: true }).click();
  await page.getByText("Your next learning adventure is coming soon.", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "Today", exact: true }).click();
  const todayTab = (await page.getByRole("tab", { name: "Today", exact: true }).boundingBox())!;
  const gamesTab = (await page.getByRole("tab", { name: "Games", exact: true }).boundingBox())!;
  await page.mouse.move(todayTab.x + todayTab.width / 2, todayTab.y + todayTab.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.move(gamesTab.x + gamesTab.width / 2, gamesTab.y + gamesTab.height / 2, { steps: 12 });
  // Drag previews the destination without navigating until release.
  assert.equal(await page.getByText("Available courses", { exact: true }).count(), 1);
  await page.mouse.up();
  await page.getByText("Your next learning adventure is coming soon.", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "Today", exact: true }).click();
  await page.mouse.move(todayTab.x + todayTab.width / 2, todayTab.y + todayTab.height / 2);
  await page.mouse.down();
  await page.mouse.move(gamesTab.x + gamesTab.width / 2, gamesTab.y + gamesTab.height / 2, { steps: 8 });
  await page.mouse.move(gamesTab.x + gamesTab.width / 2, gamesTab.y - 100, { steps: 4 });
  await page.mouse.up();
  await page.getByText("Available courses", { exact: true }).waitFor();
  const touch = await page.context().newCDPSession(page);
  const origin = (await page.getByRole("tab", { name: "Today", exact: true }).boundingBox())!;
  const destination = (await page.getByRole("tab", { name: "Profile", exact: true }).boundingBox())!;
  const y = origin.y + origin.height / 2;
  const x0 = origin.x + origin.width / 2;
  const x1 = destination.x + destination.width / 2;
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y }] });
  await page.waitForTimeout(700);
  for (let step = 1; step <= 16; step++) {
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + (x1 - x0) * step / 16, y }] });
    await page.waitForTimeout(20);
  }
  assert.equal(await page.getByText("Available courses", { exact: true }).count(), 1);
  const draggedPill = (await page.getByTestId("glass-selection").boundingBox())!;
  assert(Math.abs(draggedPill.x + draggedPill.width / 2 - x1) < 15, "Glass selection follows the finger across all four tabs");
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.getByText("Payments", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "Today", exact: true }).tap();
  await page.getByText("Available courses", { exact: true }).waitFor();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("tab", { name: "Profile", exact: true }).click();
  await page.getByText("Payments", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "Today", exact: true }).click();
  await page.getByText("Available courses", { exact: true }).waitFor();
  await page.evaluate(() => { document.querySelectorAll("div").forEach(el => { if (el.scrollHeight > el.clientHeight) el.scrollTop = 0; }); });
  await page.screenshot({ path: path.join(root, "qa/student-today-top.png") });
  assert.deepEqual(errors, []);
  console.log("PASS student tab order, enrollment count, three upcoming lessons, sample vocabulary, profile header, navigation, no runtime errors");
} finally { await browser.close(); server.close(); }


