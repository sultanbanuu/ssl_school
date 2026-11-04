// Run after exporting mobile to dist-notification-review. Uses isolated HTTP fixtures.
import { chromium, type Browser, type Page } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

type Role = "student" | "teacher" | "admin" | "manager";
type Announcement = { userId: string; title: string; message: string };
type Notification = Omit<Announcement, "userId"> & {
  id: string;
  isRead: boolean;
  createdAt: string;
};
type FixtureState = {
  signedIn: boolean;
  rows: Notification[];
  calls: { endpoint: string; query: string; method: string }[];
  errors: string[];
  failList: boolean;
  failSend: boolean;
  failRead: boolean;
  failRecipients: boolean;
  readDelay: number;
  sendDelay: number;
  sent: Announcement[];
  broadcasts: { audience: string; title: string; message: string }[];
};
const root = path.resolve(
  fileURLToPath(
    new URL("../mobile/dist-notification-review/", import.meta.url),
  ),
);
const output = path.join(root, "qa");
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  const file = path.resolve(
    root,
    "." + new URL(req.url ?? "/", "http://localhost").pathname,
  );
  if (!file.startsWith(root + path.sep) && file !== root) {
    res.writeHead(403).end();
    return;
  }
  const target =
    fs.existsSync(file) && fs.statSync(file).isFile()
      ? file
      : path.join(root, "index.html");
  res.setHeader(
    "Content-Type",
    target.endsWith(".js") ? "application/javascript" : "text/html",
  );
  fs.createReadStream(target).pipe(res);
});
const seed = (length = 3): Notification[] =>
  Array.from({ length }, (_, i) => ({
    id: `message-${i}`,
    title: `School update ${i + 1}`,
    message: `Details for update ${i + 1}.\nPlease bring your workbook to the next lesson.`,
    isRead: i === 1,
    createdAt: "2026-10-21T08:00:00Z",
  }));
const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
async function eventually(check: () => boolean | Promise<boolean>) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await wait(50);
  }
  throw new Error("Condition did not become true");
}
let browser: Browser | undefined;
let checks = 0;
async function test(name: string, run: () => Promise<void>) {
  await run();
  checks++;
  console.log(`PASS ${name}`);
}
async function screenshot(page: Page, name: string) {
  // Native-web Modal uses a slide animation; capture its settled position.
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(output, name), fullPage: true });
}
async function fixture(
  role: Role = "student",
  width = 390,
  rows = seed(),
  navigate = true,
  signedIn = true,
) {
  assert(browser, "Browser must be launched before creating a fixture");
  const context = await browser.newContext({
    viewport: { width, height: 844 },
  });
  const page = await context.newPage();
  const state: FixtureState = {
    signedIn,
    rows,
    calls: [],
    errors: [],
    failList: false,
    failSend: false,
    failRead: false,
    failRecipients: false,
    readDelay: 0,
    sendDelay: 0,
    sent: [],
    broadcasts: [],
  };
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname;
    state.calls.push({ endpoint, query: url.search, method: request.method() });
    const reply = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (request.method() === "OPTIONS") return reply({});
    const session = () => ({ session: { id: "session", userId: "self", expiresAt: "2099-01-01T00:00:00Z" }, user: { id: "self", name: "Test Account", email: "test@example.test" } });
    if (endpoint === "/api/auth/get-session") return reply(state.signedIn ? session() : null);
    if (endpoint === "/api/auth/sign-in/email" || endpoint === "/api/auth/sign-up/email") {
      state.signedIn = true;
      return reply({ ...session(), token: "fixture-token" });
    }
    if (endpoint === "/api/auth/sign-out") { state.signedIn = false; return reply({ success: true }); }
    if (endpoint === "/api/me")
      return reply({ id: "self", firstName: "Test", role });
    if (endpoint === "/api/courses") return reply([]);
    if (endpoint === "/api/performance") return reply({ enrollments: [], evaluations: [], weights: {} });
    if (endpoint === "/api/lessons" || endpoint === "/api/enrollments") return reply([]);
    if (endpoint === "/api/payments") return reply([]);
    if (endpoint === "/api/notifications/recipients")
      return state.failRecipients
        ? reply({ error: "Recipients unavailable" }, 503)
        : reply([{ id: "self", firstName: "Test", lastName: "Account", role }]);
    if (endpoint === "/api/notifications/unread-count")
      return reply({ count: state.rows.filter((row) => !row.isRead).length });
    if (request.method() === "PATCH") {
      await wait(state.readDelay);
      if (state.failRead)
        return reply({ error: "Could not mark message read" }, 503);
      state.rows.forEach((row) => {
        if (
          endpoint.endsWith("/read-all") ||
          endpoint === `/api/notifications/${row.id}/read`
        )
          row.isRead = true;
      });
      return reply({ updated: 1, isRead: true });
    }
    if (endpoint === "/api/notifications" && request.method() === "POST") {
      await wait(state.sendDelay);
      if (state.failSend) return reply({ error: "Could not send update" }, 503);
      const body = request.postDataJSON() as Announcement & {
        audience?: string;
      };
      if (body.audience === "all_students") {
        state.broadcasts.push({
          audience: body.audience,
          title: body.title,
          message: body.message,
        });
        return reply({ audience: body.audience, delivered: 12 }, 201);
      }
      state.sent.push(body);
      const item = {
        ...body,
        id: "sent-" + state.sent.length,
        isRead: false,
        createdAt: "2026-10-21T09:00:00Z",
      };
      state.rows.unshift(item);
      return reply(item, 201);
    }
    if (endpoint === "/api/notifications") {
      if (state.failList)
        return reply({ error: "Inbox temporarily unavailable" }, 503);
      const filtered = state.rows.filter(
        (row) => url.searchParams.get("unread") !== "true" || !row.isRead,
      );
      const offset = Number(url.searchParams.get("offset") || 0);
      return reply(
        filtered.slice(
          offset,
          offset + Number(url.searchParams.get("limit") || 25),
        ),
      );
    }
    return reply({});
  });
  const address = server.address();
  assert(
    address && typeof address !== "string",
    "Test server must be listening on a TCP port",
  );
  await page.goto(`http://127.0.0.1:${address.port}`);
  if (navigate) {
    await page
      .getByRole("button", { name: "Notifications", exact: true })
      .click();
    await page.getByText("All updates", { exact: true }).waitFor();
    await eventually(() =>
      Promise.resolve(!state.calls.length || state.calls.some(call => call.endpoint === "/api/notifications")),
    );
  }
  return {
    page,
    state,
    close: async () => {
      assert.deepEqual(state.errors, []);
      await context.close();
    },
  };
}

(async () => {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ channel: "msedge", headless: true });
  for (const width of [320, 390]) {
    const { page, state, close } = await fixture("student", width);
    await page.getByRole("button", { name: "Mark all as read", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Unread", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Refresh", exact: true }).count(), 0);
    assert.equal(await page.getByRole("tab", { name: "Games", exact: true }).count(), 0);
    assert.equal(await page.getByRole("tab", { name: "Practice", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Unread: School update 1. Open message" }).click();
    const back = page.getByRole("button", { name: "Back to notifications", exact: true });
    await back.waitFor();
    assert((await back.boundingBox())!.y >= 0);
    await screenshot(page, `ui-cleanup-detail-${width}.png`);
    await back.click();
    await page.getByText("All updates", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Mark all as read", exact: true }).click();
    await eventually(() => state.rows.every(row => row.isRead));
    await screenshot(page, `ui-cleanup-inbox-${width}.png`);
    await page.getByRole("tab", { name: "Profile", exact: true }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Account settings", exact: true }).click();
    await page.getByRole("button", { name: "Save account settings" }).waitFor();
    await screenshot(page, `ui-cleanup-account-${width}.png`);
    await close();
    console.log(`PASS notification navigation, mark all, hidden practice, account settings at ${width}px`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
