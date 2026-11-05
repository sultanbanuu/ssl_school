import { chromium } from "playwright";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../mobile/dist-notification-review/", import.meta.url)));
const output = path.join(root, "qa-audit");
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  const file = path.resolve(root, "." + new URL(req.url ?? "/", "http://localhost").pathname);
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(root, "index.html");
  res.setHeader("Content-Type", target.endsWith(".js") ? "application/javascript" : "text/html");
  fs.createReadStream(target).pipe(res);
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert(address && typeof address !== "string");
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "msedge", headless: true });
const event = (id: string, entityType = "payment") => ({
  id, entityType, entityId: "22222222-2222-4222-8222-222222222222", actorId: "11111111-1111-4111-8111-111111111111", actorRole: "admin", databaseUser: "school_app",
  action: "updated", createdAt: "2026-11-04T10:00:00Z", transactionId: "12345",
  before: { status: "pending", amount: 50 }, after: { status: "approved", amount: 50 },
});
let checks = 0;
try {
  for (const role of ["admin", "manager", "teacher", "student"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors: string[] = [];
    let fail = false;
    const queries: URLSearchParams[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url());
      const reply = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
      if (url.pathname === "/api/auth/get-session") return reply({ session: { id: "session", userId: "self", expiresAt: "2099-01-01T00:00:00Z" }, user: { id: "self", name: "Test", email: "test@example.test" } });
      if (url.pathname === "/api/me") return reply({ id: "self", firstName: "Test", role });
      if (url.pathname === "/api/notifications/unread-count") return reply({ count: 0 });
      if (url.pathname === "/api/audit-logs") {
        queries.push(url.searchParams);
        if (fail) return reply({ error: "Audit temporarily unavailable" }, 503);
        const filter = url.searchParams.get("entityType");
        if (filter === "role") return reply({ items: [], hasMore: false });
        if (filter === "lesson") return reply({ items: [event("lesson", "lesson")], hasMore: false });
        if (url.searchParams.get("offset") === "25") return reply({ items: [event("older")], hasMore: false });
        return reply({ items: Array.from({ length: 25 }, (_, i) => event(String(i))), hasMore: true });
      }
      return reply([]);
    });
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.getByRole("button", { name: "Notifications", exact: true }).waitFor();
    const tab = page.getByRole("button", { name: "Audit history", exact: true });
    if (role !== "admin") {
      assert.equal(await tab.count(), 0); assert.equal(queries.length, 0);
      console.log(`PASS ${role} has no audit-history navigation`); checks++;
    } else {
      await tab.click();
      await page.getByRole("button", { name: "View payment updated", exact: true }).first().waitFor();
      assert.equal(await page.getByRole("button", { name: "View payment updated", exact: true }).count(), 25);
      await page.getByRole("button", { name: "View payment updated", exact: true }).first().click();
      await page.getByText("Before: pending", { exact: true }).waitFor();
      await page.getByText("After: approved", { exact: true }).waitFor();
      assert.equal(await page.getByText("Amount", { exact: true }).count(), 0);
      await page.waitForTimeout(400); // Let the native-web modal slide finish before visual QA.
      await page.screenshot({ path: path.join(output, "audit-detail.png"), fullPage: true });
      await page.getByRole("button", { name: "Back to audit history", exact: true }).click();
      await page.getByRole("button", { name: "Load older changes", exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('[aria-label="View payment updated"]').length === 26);
      assert(queries.some(query => query.get("offset") === "25"));
      console.log("PASS admin history, changed-field details, and pagination"); checks++;
      await page.getByRole("button", { name: "Role", exact: true }).click();
      await page.getByText("No recorded changes yet.", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Lesson", exact: true }).click();
      await page.getByRole("button", { name: "View lesson updated", exact: true }).waitFor();
      fail = true;
      await page.getByRole("button", { name: "Refresh history", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "Audit temporarily unavailable" }).waitFor();
      fail = false;
      await page.getByRole("button", { name: "Refresh history", exact: true }).click();
      await page.getByRole("alert").waitFor({ state: "detached" });
      await page.screenshot({ path: path.join(output, "audit-history.png"), fullPage: true });
      console.log("PASS admin filters, empty history, request error and retry"); checks++;
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(`${checks} audit UI scenarios passed`);
} finally { await browser.close(); server.close(); }
