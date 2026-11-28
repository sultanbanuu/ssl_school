import { describe, expect, test } from "bun:test";
import { consultationRoutes, type ConsultationRequest } from "../src/modules/consultation/routes";
import { sendConsultationEmail } from "../src/modules/auth/email";
import { envSchema, type Config } from "../src/config";
import { HttpError } from "../src/shared/authorization";

function setup(send?: (request: ConsultationRequest) => Promise<void>) {
  return consultationRoutes(send).onError(({ error, set }) => {
    if (error instanceof HttpError) { set.status = error.status; return { error: error.message }; }
  }).compile();
}
function post(body: unknown, ip = "203.0.113.5") {
  return new Request("http://localhost/api/consultation", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify(body),
  });
}

describe("consultation requests", () => {
  test("a valid request is passed on to be emailed", async () => {
    const sent: ConsultationRequest[] = [];
    const app = setup(async request => { sent.push(request); });
    const response = await app.handle(post({ name: " Aysel Safarli ", phone: "+994 50 123 45 67", note: "IELTS" }));
    expect(response.status).toBe(201);
    expect(sent).toEqual([{ name: "Aysel Safarli", phone: "+994 50 123 45 67", note: "IELTS" }]);
  });

  test("missing name or phone is rejected without sending", async () => {
    const sent: ConsultationRequest[] = [];
    const app = setup(async request => { sent.push(request); });
    expect((await app.handle(post({ name: "", phone: "+994501234567" }))).status).toBe(422);
    expect((await app.handle(post({ name: "Aysel" }))).status).toBe(422);
    expect((await app.handle(post({ name: "Aysel", phone: "call me" }))).status).toBe(422);
    expect(sent).toHaveLength(0);
  });

  test("bots that fill the hidden field get a quiet success and nothing is sent", async () => {
    const sent: ConsultationRequest[] = [];
    const app = setup(async request => { sent.push(request); });
    expect((await app.handle(post({ name: "Bot", phone: "+15555550100", website: "spam.example" }))).status).toBe(200);
    expect(sent).toHaveLength(0);
  });

  test("one person can try at most four times an hour", async () => {
    let clock = 0;
    let count = 0;
    const app = consultationRoutes(async () => { count++; }, () => clock).compile();
    for (let i = 0; i < 4; i++) expect((await app.handle(post({ name: "A", phone: "+994501234567" }))).status).toBe(201);
    const blocked = await app.handle(post({ name: "A", phone: "+994501234567" }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("3600");
    expect((await blocked.json()).retryAfter).toBe(3600);
    // The same phone number from another connection is still the same person.
    expect((await app.handle(post({ name: "A", phone: "050 123 45 67" }, "198.51.100.7"))).status).toBe(429);
    expect((await app.handle(post({ name: "B", phone: "+994551112233" }, "198.51.100.8"))).status).toBe(201);
    clock = 60 * 60 * 1000;
    expect((await app.handle(post({ name: "A", phone: "+994501234567" }))).status).toBe(201);
    expect(count).toBe(6);
  });

  test("without email delivery configured the form reports unavailable", async () => {
    expect((await setup().handle(post({ name: "A", phone: "+994501234567" }))).status).toBe(503);
  });

  test("the email goes to the admin inbox with the visitor's details", async () => {
    const config = envSchema.parse({
      DATABASE_URL: "postgresql://localhost/test",
      BETTER_AUTH_SECRET: "x".repeat(32),
      BETTER_AUTH_URL: "http://localhost:3000",
      TRUSTED_ORIGINS: "http://localhost:8081",
      RESEND_API_KEY: "re_test",
      EMAIL_FROM: "noreply@sslschool.az",
    }) as Config;
    let payload: any;
    await sendConsultationEmail(config, { name: "Aysel\nSafarli", phone: "+994501234567", note: "" }, (async (_url: string, init: RequestInit) => {
      payload = JSON.parse(String(init.body));
      return new Response("{}", { status: 200 });
    }) as typeof fetch);
    expect(payload.to).toEqual(["admin.sslschool@gmail.com"]);
    expect(payload.subject).toBe("Yeni konsultasiya müraciəti: Aysel Safarli");
    expect(payload.text).toContain("Telefon: +994501234567");
  });
});
