// Export web first. All API requests are intercepted; no email is sent.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import path from "node:path";

const root = path.resolve("mobile/dist-notification-review");
const server = Bun.serve({ port: 0, async fetch(request) {
  const pathname = new URL(request.url).pathname;
  const target = path.resolve(root, "." + pathname);
  if (!target.startsWith(root + path.sep) && target !== root) return new Response(null, { status: 403 });
  const file = Bun.file(target);
  return new Response(await file.exists() && pathname !== "/" ? file : Bun.file(path.join(root, "index.html")));
} });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    let sends = 0;
    let failSend = false;
    await page.route("**/api/**", async route => {
      const endpoint = new URL(route.request().url()).pathname;
      let status = 200;
      let body: unknown = null;
      if (endpoint.endsWith("/me")) status = 401;
      else if (endpoint.endsWith("/sign-up/email")) body = { token: null, user: { id: "test", email: "student@example.com" } };
      else if (endpoint.endsWith("/sign-in/email")) { status = 403; body = { code: "EMAIL_NOT_VERIFIED" }; }
      else if (endpoint.endsWith("/send-verification-email")) {
        sends++;
        assert.equal(route.request().postDataJSON().email, "student@example.com");
        status = failSend ? 500 : 200;
        body = failSend ? { message: "Provider failed" } : { status: true };
      }
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(process.env.VERIFICATION_UI_URL || `http://localhost:${server.port}`);
    await page.getByRole("button", { name: "Create an account", exact: true }).click();
    for (const [label, value] of Object.entries({ Name: "Test", Surname: "Student", "Phone number": "+994501234567", "Birth date (YYYY-MM-DD)": "2000-01-01", "Email address": "student@example.com", Password: "long-test-password", "Confirm password": "long-test-password" })) {
      await page.getByLabel(label, { exact: true }).fill(value);
    }
    await page.getByRole("radio", { name: "0-1hr", exact: true }).click();
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByRole("heading", { name: "Check your email." }).waitFor();
    assert(await page.getByText("student@example.com", { exact: true }).isVisible());
    assert(await page.getByRole("button", { name: /Resend email in/ }).isDisabled());
    assert.equal(await page.getByLabel("Password", { exact: true }).count(), 0);
    await page.screenshot({ path: path.join(root, `verification-${width}.png`), fullPage: true });
    await page.clock.install();
    await page.clock.fastForward(61000);
    failSend = true;
    await page.getByRole("button", { name: "Resend verification email", exact: true }).click();
    await page.getByText("We couldn't send the verification email. Please try again or contact the school.").waitFor();
    failSend = false;
    await page.getByRole("button", { name: "Resend verification email", exact: true }).click();
    await page.getByText(/a new link has been requested/).waitFor();
    assert.equal(sends, 2);
    await page.getByRole("button", { name: /Back to sign in/ }).click();
    assert.equal(await page.getByLabel("Password", { exact: true }).inputValue(), "");
    await page.getByLabel("Password", { exact: true }).fill("long-test-password");
    await page.getByRole("button", { name: "Sign in →", exact: true }).click();
    await page.getByRole("heading", { name: "Check your email." }).waitFor();
    console.log(`PASS verification signup, resend failure/recovery, cooldown and unverified sign-in (${width}px)`);
    await page.close();
  }
} finally {
  await browser.close();
  server.stop(true);
}
