import { expect, test } from "bun:test";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth } from "../src/modules/auth/service";
import { sendVerificationEmail } from "../src/modules/auth/email";
import { createDatabase } from "../src/db";
import { envSchema, type Config } from "../src/config";

const config: Config = {
  DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
  BETTER_AUTH_SECRET: "test-only-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
  BETTER_AUTH_URL: "http://localhost:3000", TRUSTED_ORIGINS: ["http://localhost:8082"],
  PORT: 3000, NODE_ENV: "test", RECEIPT_CLEANUP_ENABLED: false,
};

test("signup requires verification; invalid links fail and a valid link enables sign-in", async () => {
  const db = createDatabase(config.DATABASE_URL);
  try {
    const options = createAuth(db, config).options;
    const links: string[] = [];
    const auth = betterAuth({ ...options,
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      emailVerification: { ...options.emailVerification, sendVerificationEmail: async ({ url }) => { links.push(url); } },
    });
    const post = (path: string, body: object) => auth.handler(new Request(`${config.BETTER_AUTH_URL}/api/auth/${path}`, {
      method: "POST", headers: { "content-type": "application/json", origin: config.TRUSTED_ORIGINS[0]! }, body: JSON.stringify(body),
    }));
    const credentials = { email: "student@example.com", password: "a-long-test-password", callbackURL: "http://localhost:8082/" };
    const signup = await post("sign-up/email", { ...credentials, name: "Test Student", firstName: "Test", lastName: "Student", phone: "+994501234567", birthDate: "2000-01-01", learningTime: "0-1hr" });
    expect(signup.status).toBe(200);
    expect((await signup.json()).token).toBeNull();
    expect(links).toHaveLength(1);
    const denied = await post("sign-in/email", credentials);
    expect(denied.status).toBe(403);
    expect((await denied.json()).code).toBe("EMAIL_NOT_VERIFIED");
    const invalid = await auth.handler(new Request(`${config.BETTER_AUTH_URL}/api/auth/verify-email?token=invalid`));
    expect(invalid.status).toBeGreaterThanOrEqual(400);
    const resent = await post("send-verification-email", { email: credentials.email, callbackURL: credentials.callbackURL });
    expect(resent.status).toBe(200);
    expect(links).toHaveLength(3);
    const verified = await auth.handler(new Request(links.at(-1)!));
    expect(verified.status).toBe(302);
    expect(verified.headers.get("location")).toBe(credentials.callbackURL);
    const signedIn = await post("sign-in/email", credentials);
    expect(signedIn.status).toBe(200);
    expect((await signedIn.json()).token).toBeTruthy();
  } finally { await db.$disconnect(); }
});

test("verification email delivery rejects missing configuration and provider failures", async () => {
  await expect(sendVerificationEmail(config, "student@example.com", "https://example.com/verify")).rejects.toThrow("not configured");
  const mailConfig = { ...config, RESEND_API_KEY: "test-key", EMAIL_FROM: "accounts@example.com" };
  let body: any;
  const send = (async (_url: unknown, init: RequestInit) => { body = JSON.parse(init.body as string); return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
  await sendVerificationEmail(mailConfig, "student@example.com", "https://example.com/verify?token=test", send);
  expect(body.to).toEqual(["student@example.com"]);
  expect(body.text).toContain("https://example.com/verify?token=test");
  await expect(sendVerificationEmail(mailConfig, "student@example.com", "https://example.com/verify", (async () => new Response("private provider error", { status: 500 })) as unknown as typeof fetch)).rejects.toThrow("Unable to deliver");
});

test("production rejects Resend's testing sender and trims mail configuration", () => {
  const env = { ...config, RECEIPT_CLEANUP_ENABLED: "false", TRUSTED_ORIGINS: "https://sslschool.az", NODE_ENV: "production", RESEND_API_KEY: " test-key " };
  expect(envSchema.safeParse({ ...env, EMAIL_FROM: "onboarding@resend.dev" }).success).toBe(false);
  expect(envSchema.safeParse({ ...env, EMAIL_FROM: " ONBOARDING@RESEND.DEV " }).success).toBe(false);
  const valid = envSchema.parse({ ...env, EMAIL_FROM: " no-reply@sslschool.az " });
  expect(valid.EMAIL_FROM).toBe("no-reply@sslschool.az");
  expect(valid.RESEND_API_KEY).toBe("test-key");
  expect(envSchema.safeParse({ ...env, NODE_ENV: "development", EMAIL_FROM: "onboarding@resend.dev" }).success).toBe(true);
});


