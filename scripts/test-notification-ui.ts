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
const root = process.env.NOTIFICATION_UI_ROOT ? path.resolve(process.env.NOTIFICATION_UI_ROOT) : path.resolve(
  fileURLToPath(
    new URL("../mobile/dist-notification-review/", import.meta.url),
  ),
);
const output = path.resolve("mobile/dist-notification-review/qa");
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
  if (process.env.NOTIFICATION_UI_FILTER && !new RegExp(process.env.NOTIFICATION_UI_FILTER).test(name)) return;
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
      return state.signedIn
        ? reply({ id: "self", firstName: "Test", role })
        : reply({ error: "Unauthorized" }, 401);
    if (endpoint === "/api/lessons" || endpoint === "/api/enrollments" || endpoint === "/api/courses") return reply([]);
    if (endpoint === "/api/payments") return reply([]);
    if (endpoint === "/api/performance") return reply({ enrollments: [], evaluations: [], weights: {} });
    if (endpoint === "/api/notifications/recipients")
      return state.failRecipients
        ? reply({ error: "Recipients unavailable" }, 503)
        : reply([{ id: "student-recipient", firstName: "Test", lastName: "Account", role: "student" }]);
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
      if (body.userId === "self") state.rows.unshift(item);
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
  if (rows.some((row) => !row.isRead)) {
    await page.getByTestId("floating-notification").waitFor();
    if (navigate)
      await page
        .getByRole("button", { name: "Dismiss notification", exact: true })
        .click();
  }
  if (navigate) {
    await page
      .getByRole("button", { name: "Notifications", exact: true })
      .click();
    await page.getByText("All updates", { exact: true }).waitFor();
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
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "msedge",
    headless: true,
  });
  for (const role of ["manager", "teacher", "student"] as const)
    await test(`${role} cannot compose student announcements`, async () => {
      const { page, state, close } = await fixture(role, 390, []);
      assert.equal(await page.getByRole("button", { name: "+  Send a school update", exact: true }).count(), 0);
      assert.equal(state.calls.filter(c => c.endpoint.endsWith("/recipients")).length, 0);
      await close();
    });
  for (const role of ["student", "teacher", "manager", "admin"] as const)
    await test(`${role} restores one session across lessons, payments and notifications`, async () => {
      const { page, state, close } = await fixture(role, 390, [], false);
      if (role === "student") {
        // The student app opens on Today; Lesson and Profile are tabs, billing lives under Profile.
        await page.getByText("Hi, Test.", { exact: true }).waitFor();
        await page.getByRole("button", { name: "Notifications", exact: true }).click();
        await page.getByText("Nothing here yet", { exact: true }).waitFor();
        await page.getByRole("tab", { name: "Lesson", exact: true }).click();
        await page.getByRole("heading", { name: "Your lessons", exact: true }).waitFor();
        await page.getByRole("tab", { name: "Profile", exact: true }).click();
        await page.getByRole("button", { name: "Settings", exact: true }).click();
        await page.getByRole("button", { name: "Billing & subscriptions", exact: true }).click();
        await page.getByRole("button", { name: "Sign out", exact: true }).waitFor({ state: "hidden" });
        await page.getByRole("button", { name: /^Back to/ }).click();
        await page.getByRole("button", { name: "Sign out", exact: true }).click();
        await page.getByRole("textbox", { name: "Email address", exact: true }).waitFor();
        assert.equal(state.signedIn, false);
        await close();
        return;
      }
      await page.getByRole("heading", { name: (role as string) === "student" ? "Your lessons" : "Lesson calendar", exact: true }).waitFor();
      // Only admins have a Payments entry in staff navigation.
      if (role === "admin") {
        await page.getByRole("button", { name: "Payments", exact: true }).click();
        await page.getByText("Payment review", { exact: true }).waitFor();
      } else {
        assert.equal(await page.getByRole("button", { name: "Payments", exact: true }).count(), 0);
      }
      await page.getByRole("button", { name: "Notifications", exact: true }).click();
      await page.getByText("Nothing here yet", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Lessons", exact: true }).click();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await page.getByRole("textbox", { name: "Email address", exact: true }).waitFor();
      assert.equal(state.signedIn, false);
      await close();
    });
  // Sign-up now requires email verification; that flow is covered by test-verification-ui.ts.
  await test("sign-in opens the combined school app", async () => {
    const { page, state, close } = await fixture("student", 390, [], false, false);
    await page.getByRole("textbox", { name: "Email address", exact: true }).waitFor();
    await page.getByRole("textbox", { name: "Email address", exact: true }).fill("student@example.test");
    await page.getByRole("textbox", { name: "Password", exact: true }).fill("fixture-password-123");
    await page.getByRole("button", { name: /^Sign in\s*→$/ }).click();
    await page.getByText("Hi, Test.", { exact: true }).waitFor();
    assert.equal(state.signedIn, true);
    assert(state.calls.some(c => c.endpoint === "/api/auth/sign-in/email"));
    await close();
  });
  await test("student inbox shows full messages and marks all as read", async () => {
    const { page, state, close } = await fixture();
    await page.getByText("School update 1", { exact: true }).waitFor();
    await page.getByText("Details for update 1.", { exact: false }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "+  Send a school update", exact: true }).count(),
      0,
    );
    assert.equal(state.calls.filter((c) => c.endpoint.endsWith("/recipients")).length, 0);
    await page.screenshot({ path: path.join(output, "inbox-mobile.png"), fullPage: true });
    await page.getByRole("button", { name: "Mark all as read", exact: true }).click();
    await eventually(() => state.rows.every((row) => row.isRead));
    await eventually(async () => await page.getByRole("button", { name: "Mark all as read", exact: true }).isDisabled());
    await page.screenshot({ path: path.join(output, "empty-mobile.png"), fullPage: true });
    await close();
  });
  await test("mark all as read is locked while saving and sends one request", async () => {
    const { page, state, close } = await fixture();
    state.readDelay = 600;
    await page.getByRole("button", { name: "Mark all as read", exact: true }).click();
    await page.getByRole("button", { name: "Updating…", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Updating…", exact: true }).isDisabled(), true);
    await eventually(() => state.rows.every((row) => row.isRead));
    await eventually(async () => (await page.getByRole("button", { name: "Updating…", exact: true }).count()) === 0);
    assert.equal(state.calls.filter((c) => c.method === "PATCH").length, 1);
    await close();
  });
  await test("pagination loads 25 + 5 messages without duplicates", async () => {
    const { page, close } = await fixture("student", 390, seed(30));
    await page.getByRole("button", { name: "Load more", exact: true }).click();
    await page.getByText("School update 30", { exact: true }).waitFor();
    assert.equal(await page.getByText(/^School update \d+$/).count(), 30);
    assert.equal(await page.getByRole("button", { name: "Load more", exact: true }).count(), 0);
    await close();
  });
  await test("failed inbox reload can be retried", async () => {
    const { page, state, close } = await fixture();
    state.failList = true;
    await page.getByRole("button", { name: "Mark all as read", exact: true }).click();
    await page.getByText("Inbox temporarily unavailable", { exact: true }).waitFor();
    state.failList = false;
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await eventually(
      async () => (await page.getByRole("button", { name: "Try again", exact: true }).count()) === 0,
    );
    await page.getByText("School update 1", { exact: true }).waitFor();
    await close();
  });
  for (const role of ["admin"] as const)
    await test(`${role} composer validation, failed send, retry, confirmation and private inbox`, async () => {
      const { page, state, close } = await fixture(
        role,
        role === "admin" ? 1280 : 390,
      );
      await page
        .getByRole("button", { name: "+  Send a school update", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Test Account · student", exact: true })
        .click();
      const send = page.getByRole("button", {
        name: "Send notification",
        exact: true,
      });
      assert.equal(await send.isEnabled(), false);
      await page
        .getByRole("textbox", { name: "Notification title", exact: true })
        .fill("  Lesson reminder  ");
      await page
        .getByRole("textbox", { name: "Notification message", exact: true })
        .fill("  Bring your workbook tomorrow.  ");
      await page.screenshot({
        path: path.join(output, `composer-${role}.png`),
        fullPage: true,
      });
      state.failSend = true;
      await send.click();
      await page.getByText("Could not send update", { exact: true }).waitFor();
      assert.equal(
        await page
          .getByRole("textbox", { name: "Notification title", exact: true })
          .inputValue(),
        "  Lesson reminder  ",
      );
      state.failSend = false;
      state.sendDelay = 500;
      await send.click();
      await page.keyboard.press("Escape");
      await page.getByText("Update sent.", { exact: true }).waitFor();
      assert.deepEqual(state.sent, [
        {
          userId: "student-recipient",
          title: "Lesson reminder",
          message: "Bring your workbook tomorrow.",
        },
      ]);
      await page.screenshot({
        path: path.join(output, `sent-${role}.png`),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Back to notifications", exact: true })
        .click();
      // The announcement goes to another student, so it must not appear in the admin's own inbox.
      await eventually(async () => (await page.getByText("Lesson reminder", { exact: true }).count()) === 0);
      await close();
    });
  await test("recipient load failure is recoverable", async () => {
    const { page, state, close } = await fixture("admin");
    state.failRecipients = true;
    await page
      .getByRole("button", { name: "+  Send a school update", exact: true })
      .click();
    await page.getByText("Recipients unavailable", { exact: true }).waitFor();
    state.failRecipients = false;
    await page
      .getByRole("button", { name: "Load more recipients", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Test Account · student", exact: true })
      .waitFor();
    await close();
  });
  await test("failed mark-all preserves unread state and supports retry", async () => {
    const { page, state, close } = await fixture();
    state.failRead = true;
    await page.getByRole("button", { name: "Mark all as read", exact: true }).click();
    await page.getByText("Could not mark message read", { exact: true }).waitFor();
    assert.equal(state.rows.some((row) => !row.isRead), true);
    state.failRead = false;
    await page.getByRole("button", { name: "Mark all as read", exact: true }).click();
    await eventually(() => state.rows.every((row) => row.isRead));
    await close();
  });
  await test("long message remains readable on a 320px viewport", async () => {
    const rows = seed(1);
    rows[0].title = "A".repeat(160);
    rows[0].message = "School update details. ".repeat(220);
    const { page, close } = await fixture("student", 320, rows);
    await page.getByText("School update details.", { exact: false }).first().waitFor();
    await screenshot(page, "long-detail-mobile.png");
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    await close();
  });
  await test("teacher cannot compose; empty inbox renders", async () => {
    const { page, state, close } = await fixture("teacher", 390, []);
    await page.getByText("Nothing here yet", { exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "+  Send a school update", exact: true })
        .count(),
      0,
    );
    assert.equal(
      state.calls.filter((c) => c.endpoint.endsWith("/recipients")).length,
      0,
    );
    await close();
  });
  for (const role of ["admin", "teacher"] as const)
    await test(`${role} can switch notifications on and off`, async () => {
      const { page, close } = await fixture(role, 1440, []);
      await page.getByRole("button", { name: /Notifications/ }).first().click();
      await page.evaluate(() => {
        Object.defineProperty(Notification, "permission", { configurable: true, get: () => "granted" });
        localStorage.setItem("school-web-push-token", "web:fixture");
        let subscribed = true;
        Object.defineProperty(navigator.serviceWorker, "getRegistration", { configurable: true, value: async () => ({
          pushManager: { getSubscription: async () => subscribed ? { unsubscribe: async () => { subscribed = false; return true; } } : null },
          getNotifications: async () => [],
        }) });
        window.dispatchEvent(new Event("school-push-settings"));
      });
      const toggle = page.getByRole("switch", { name: "Browser notifications", exact: true });
      await toggle.waitFor();
      assert.equal(await toggle.isChecked(), true);
      await toggle.click();
      await page.getByText("Browser notifications are off. Your updates are still available in the inbox.", { exact: true }).waitFor();
      assert.equal(await toggle.isChecked(), false);
      assert.equal(await page.evaluate(() => localStorage.getItem("school-web-push-disabled")), "true");
      await close();
    });
  await test("desktop prompt hides when enabled and settings can disable notifications", async () => {
    const { page, close } = await fixture("student", 1440, []);
    await page.getByRole("button", { name: "Enable browser notifications", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Send test desktop notification", exact: true }).count(), 0);
    await page.evaluate(() => {
      Object.defineProperty(Notification, "permission", { configurable: true, get: () => "granted" });
      localStorage.setItem("school-web-push-token", "web:fixture");
      let subscribed = true;
      Object.defineProperty(navigator.serviceWorker, "getRegistration", { configurable: true, value: async () => ({
        pushManager: { getSubscription: async () => subscribed ? { unsubscribe: async () => { subscribed = false; return true; } } : null },
        getNotifications: async () => [],
      }) });
      window.dispatchEvent(new Event("school-push-settings"));
    });
    await page.getByRole("button", { name: "Enable browser notifications", exact: true }).waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Open profile", exact: true }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const toggle = page.getByRole("switch", { name: "Browser notifications", exact: true });
    await toggle.waitFor();
    assert.equal(await toggle.isChecked(), true);
    await toggle.click();
    await page.getByText("Browser notifications are off. Your updates are still available in the inbox.", { exact: true }).waitFor();
    assert.equal(await toggle.isChecked(), false);
    assert.equal(await page.evaluate(() => localStorage.getItem("school-web-push-disabled")), "true");
    await screenshot(page, "desktop-notification-settings.png");
    await page.route("**/api/notifications/push-config", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ publicKey: "AQID" }) }));
    await page.evaluate(() => {
      let subscribed = false;
      const subscription = { endpoint: "https://fcm.googleapis.com/fixture", toJSON: () => ({ keys: { p256dh: "fixture", auth: "fixture" } }), unsubscribe: async () => { subscribed = false; return true; } };
      const registration = {
        pushManager: { getSubscription: async () => subscribed ? subscription : null, subscribe: async () => { subscribed = true; return subscription; } },
        getNotifications: async () => [],
      };
      Object.defineProperty(navigator.serviceWorker, "getRegistration", { configurable: true, value: async () => registration });
      Object.defineProperty(navigator.serviceWorker, "register", { configurable: true, value: async () => registration });
      Object.defineProperty(navigator.serviceWorker, "ready", { configurable: true, value: Promise.resolve(registration) });
    });
    await toggle.click();
    await page.getByRole("button", { name: "Send test desktop notification", exact: true }).waitFor();
    assert.equal(await toggle.isChecked(), true);
    assert.equal(await page.evaluate(() => localStorage.getItem("school-web-push-disabled")), null);
    await page.getByRole("button", { name: "Send test desktop notification", exact: true }).waitFor();
    await close();
  });
  for (const width of [390, 1440]) await test(`desktop responsive top banner ${width}`, async () => {
    const { page, close } = await fixture("student", width, seed(), false);
    const box = await page.getByTestId("floating-notification").boundingBox();
    assert(box);
    assert(box.y < 40);
    assert(Math.abs(box.width - Math.min(width, 1200)) < 2);
    assert(Math.abs(box.x - (width - box.width) / 2) < 2);
    await screenshot(page, `top-notification-${width}.png`);
    await close();
  });
  await test("browser push enable button explains blocked permission", async () => {
    const { page, close } = await fixture("student", 1440, []);
    await page.evaluate(() => Object.defineProperty(Notification, "permission", { configurable: true, get: () => "denied" }));
    await page.getByRole("button", { name: "Enable browser notifications", exact: true }).click();
    await page.getByText("Notifications are blocked. Allow them in your browser’s site settings, then try again.", { exact: true }).waitFor();
    await screenshot(page, "browser-push-permission.png");
    await close();
  });
  await test("floating updates, dismissal, unread badge and opening the inbox", async () => {
    const { page, state, close } = await fixture("student", 390, seed(), false);
    assert.equal(await page.getByTestId("notification-badge").innerText(), "2");
    await page
      .getByRole("button", { name: "Dismiss notification", exact: true })
      .click();
    await eventually(
      async () =>
        (await page.getByTestId("floating-notification").count()) === 0,
    );
    state.rows.unshift({
      id: "new-arrival",
      title: "Your next lesson",
      message: "Your lesson starts tomorrow at 10:00.",
      isRead: false,
      createdAt: "2026-10-21T10:00:00Z",
    });
    await page
      .getByTestId("floating-notification")
      .getByText("Your next lesson", { exact: true })
      .waitFor({ timeout: 20000 });
    assert.equal(await page.getByTestId("notification-badge").innerText(), "3");
    await screenshot(page, "floating-notification.png");
    await page
      .getByRole("button", { name: "Open notification inbox", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Mark all as read", exact: true })
      .click();
    await eventually(
      async () => (await page.getByTestId("notification-badge").count()) === 0,
    );
    await close();
  });
  await test("badge caps large counts at 99+", async () => {
    const { page, close } = await fixture("student", 390, seed(105));
    assert.equal(
      await page.getByTestId("notification-badge").innerText(),
      "99+",
    );
    await close();
  });
  await test("all-students broadcast does not require an individual recipient", async () => {
    const { page, state, close } = await fixture("admin");
    await page
      .getByRole("button", { name: "+  Send a school update", exact: true })
      .click();
    await page
      .getByRole("button", { name: "All students", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Notification title", exact: true })
      .fill("School announcement");
    await page
      .getByRole("textbox", { name: "Notification message", exact: true })
      .fill("The school library is open this Saturday.");
    await screenshot(page, "all-students-composer.png");
    await page
      .getByRole("button", { name: "Send to all students", exact: true })
      .click();
    await page
      .getByText("Your update was sent to 12 students.", { exact: false })
      .waitFor();
    assert.deepEqual(state.broadcasts, [
      {
        audience: "all_students",
        title: "School announcement",
        message: "The school library is open this Saturday.",
      },
    ]);
    assert.equal(state.sent.length, 0);
    await close();
  });
  console.log(`${checks} browser scenarios passed. Screenshots: ${output}`);
})()
  .catch((error) => {
    console.error(error);
    for (const context of browser?.contexts() ?? []) for (const page of context.pages()) {
      void page.locator("body").innerText().then(text => console.error(text.slice(0, 1800))).catch(() => {});
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    server.close();
  });
