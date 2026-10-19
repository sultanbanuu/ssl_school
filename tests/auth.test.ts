import { expect, test } from "bun:test";
import { createAuth } from "../src/auth";
import { createDatabase } from "../src/db";

test("public signup is disabled before any database write", async () => {
  const db = createDatabase("postgresql://unused:unused@127.0.0.1:1/unused");
  try {
    const auth = createAuth(db, {
      DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
      BETTER_AUTH_SECRET: "test-only-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
      BETTER_AUTH_URL: "http://localhost:3000", TRUSTED_ORIGINS: ["http://localhost:8081"], PORT: 3000, NODE_ENV: "test",
    });
    const response = await auth.handler(new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:8081" },
      body: JSON.stringify({ name: "Unauthorized", email: "outsider@example.test", password: "long-enough-password" }),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("EMAIL_PASSWORD_SIGN_UP_DISABLED");
  } finally { await db.$disconnect(); }
});
