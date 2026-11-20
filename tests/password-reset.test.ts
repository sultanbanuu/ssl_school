import { expect, test } from "bun:test";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth } from "../src/modules/auth/service";
import { createDatabase } from "../src/db";
import { sendPasswordResetEmail } from "../src/modules/auth/email";
import type { Config } from "../src/config";

const config: Config = {
  DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
  BETTER_AUTH_SECRET: "test-only-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
  BETTER_AUTH_URL: "http://localhost:3000", TRUSTED_ORIGINS: ["http://localhost:8082"],
  PORT: 3000, NODE_ENV: "test", RECEIPT_CLEANUP_ENABLED: false,
};

test("reset links are private, expire, work once, change credentials and revoke sessions", async () => {
  const db = createDatabase(config.DATABASE_URL);
  try {
    const options = createAuth(db, config).options;
    const store: Record<string, any[]> = { user: [], session: [], account: [], verification: [] };
    let verificationURL = "";
    let resetURL = "";
    let token = "";
    const auth = betterAuth({ ...options, database: memoryAdapter(store), rateLimit: { enabled: false },
      advanced: { ...options.advanced, disableOriginCheck: false },
      emailVerification: { ...options.emailVerification, sendVerificationEmail: async ({ url }) => { verificationURL = url; } },
      emailAndPassword: { ...options.emailAndPassword, enabled: true, sendResetPassword: async (data) => { resetURL = data.url; token = data.token; } },
    });
    const post = (path: string, body: object) => auth.handler(new Request(`${config.BETTER_AUTH_URL}/api/auth/${path}`, {
      method: "POST", headers: { "content-type": "application/json", origin: config.TRUSTED_ORIGINS[0]! }, body: JSON.stringify(body),
    }));
    const credentials = { email: "reset@example.com", password: "original-long-password" };
    expect((await post("sign-up/email", { ...credentials, name: "Test Student", firstName: "Test", lastName: "Student", phone: "+994501234567", birthDate: "2000-01-01", learningTime: "0-1hr" })).status).toBe(200);
    await auth.handler(new Request(verificationURL));
    expect((await post("sign-in/email", credentials)).status).toBe(200);
    expect(store.session!.length).toBe(1);
    const redirectTo = "http://localhost:8082/?flow=reset-password";
    const unknown = await post("request-password-reset", { email: "unknown@example.com", redirectTo });
    expect(resetURL).toBe("");
    const known = await post("request-password-reset", { email: credentials.email, redirectTo });
    expect(await unknown.json()).toEqual(await known.json());
    const callback = await auth.handler(new Request(resetURL));
    expect(new URL(callback.headers.get("location")!).searchParams.get("token")).toBe(token);
    expect((await post("reset-password", { token, newPassword: "short" })).status).toBe(400);
    expect((await post("reset-password", { token: "invalid", newPassword: "replacement-password" })).status).toBe(400);
    const reset = { token, newPassword: "replacement-password" };
    expect((await post("reset-password", reset)).status).toBe(200);
    expect(store.session!).toHaveLength(0);
    expect((await post("reset-password", reset)).status).toBe(400);
    expect((await post("sign-in/email", credentials)).status).toBe(401);
    expect((await post("sign-in/email", { ...credentials, password: reset.newPassword })).status).toBe(200);
    await post("request-password-reset", { email: credentials.email, redirectTo });
    store.verification!.find(row => row.identifier === `reset-password:${token}`).expiresAt = new Date(0);
    expect((await post("reset-password", { token, newPassword: "another-long-password" })).status).toBe(400);
    expect((await auth.handler(new Request(resetURL))).headers.get("location")).toContain("error=INVALID_TOKEN");
    expect((await post("request-password-reset", { email: credentials.email, redirectTo: "https://untrusted.example/" })).status).toBe(403);
  } finally { await db.$disconnect(); }
});

test("reset email uses existing Resend configuration and includes expiry and ignore guidance", async () => {
  let body: any;
  await sendPasswordResetEmail({ ...config, RESEND_API_KEY: "test", EMAIL_FROM: "school@example.com" }, "reset@example.com", "https://example.com/reset", (async (_url: unknown, init: RequestInit) => {
    body = JSON.parse(init.body as string);
    return new Response("{}");
  }) as typeof fetch);
  expect(body.subject).toBe("Reset your SSL School password");
  expect(body.text).toContain("https://example.com/reset");
  expect(body.text).toContain("one hour");
  expect(body.text).toContain("ignore this email");
});
