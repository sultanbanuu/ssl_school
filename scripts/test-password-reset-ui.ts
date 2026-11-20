// Uses intercepted API responses; no real emails or password changes.
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
    let requests = 0;
    let resets = 0;
    let failSend = true;
    await page.route("**/api/**", async route => {
      const endpoint = new URL(route.request().url()).pathname;
      let status = 200;
      let body: unknown = { status: true };
      if (endpoint.endsWith("/me")) status = 401;
      else if (endpoint.endsWith("/request-password-reset")) {
        requests++;
        assert.equal(route.request().postDataJSON().email, "student@example.com");
        assert.equal(new URL(route.request().postDataJSON().redirectTo).searchParams.get("flow"), "reset-password");
        if (failSend) { status = 500; body = { message: "Provider failure" }; }
      } else if (endpoint.endsWith("/reset-password")) {
        resets++;
        assert.equal(route.request().postDataJSON().token, "test-token");
        assert.equal(route.request().postDataJSON().newPassword, "replacement-password");
      }
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    const base = process.env.PASSWORD_RESET_UI_URL || `http://localhost:${server.port}/`;
    await page.goto(base);
    await page.getByRole("button", { name: "Forgot Password?", exact: true }).waitFor();
    assert.equal(await page.getByText("Welcome back.", { exact: true }).count(), 0);
    assert.equal(await page.getByText("YOUR LEARNING JOURNEY", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Resend verification email", exact: true }).count(), 0);
    await page.screenshot({ path: path.join(root, `signin-${width}.png`), fullPage: true });
    await page.getByLabel("Email address", { exact: true }).fill("student@example.com");
    await page.getByRole("button", { name: "Forgot Password?", exact: true }).click();
    assert.equal(await page.getByLabel("Password", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "Send reset link", exact: true }).click();
    await page.getByText("We couldn't send the reset email. Please try again.").waitFor();
    failSend = false;
    await page.getByRole("button", { name: "Send reset link", exact: true }).click();
    await page.getByText(/If an account exists/).waitFor();
    assert.equal(requests, 2);
    assert(await page.getByRole("button", { name: "Reset link requested" }).isDisabled());
    await page.goto(`${base}?flow=reset-password&token=test-token`);
    await page.getByLabel("Confirm password", { exact: true }).waitFor();
    assert(!page.url().includes("token="));
    await page.getByLabel("Password", { exact: true }).fill("replacement-password");
    await page.getByLabel("Confirm password", { exact: true }).fill("mismatch");
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    await page.getByText("Your passwords don't match.", { exact: true }).waitFor();
    assert.equal(resets, 0);
    await page.getByLabel("Confirm password", { exact: true }).fill("replacement-password");
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    await page.getByText("Your password has been reset. Sign in with your new password.").waitFor();
    assert.equal(resets, 1);
    await page.goto(`${base}?flow=reset-password&error=INVALID_TOKEN`);
    await page.getByText("This reset link is invalid or has expired. Request a new link below.").waitFor();
    assert(await page.getByRole("button", { name: "Send reset link" }).isVisible());
    console.log(`PASS password recovery and sign-in UI (${width}px)`);
    await page.close();
  }
} finally { await browser.close(); server.stop(true); }
