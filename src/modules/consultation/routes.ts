import { Elysia } from "elysia";
import { z } from "zod";
import { HttpError } from "../../shared/authorization";

export type SendConsultation = (request: ConsultationRequest) => Promise<void>;
export type ConsultationRequest = { name: string; phone: string; note: string };

const consultationBody = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(7).max(35).regex(/^\+?[\d\s().-]+$/),
  note: z.string().trim().max(500).default(""),
  // Hidden field real visitors never fill; bots that fill every input are dropped silently.
  website: z.string().max(200).optional(),
}).strict();

export const consultationWindowMs = 60 * 60 * 1000;
export const consultationLimit = 4;

// Public landing-page form: each request is emailed to the school's admin inbox.
// One person (same connection or same phone number) gets at most four attempts per hour.
export function consultationRoutes(send?: SendConsultation, now = () => Date.now()) {
  const recent = new Map<string, number[]>();
  return new Elysia().post("/api/consultation", async ({ body, request, server, set }) => {
    if (body.website) return { ok: true };
    if (!send) throw new HttpError(503, "Consultation requests are not available right now");

    const client = request.headers.get("cf-connecting-ip")
      ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? server?.requestIP(request)?.address
      ?? "unknown";
    const keys = [`ip:${client}`, `phone:${body.phone.replace(/\D/g, "").slice(-9)}`];
    const time = now();
    const history = keys.map(key => (recent.get(key) ?? []).filter(at => time - at < consultationWindowMs));
    const full = history.filter(hits => hits.length >= consultationLimit);
    if (full.length) {
      const retryAfter = Math.ceil(Math.max(...full.map(hits => hits[0]! + consultationWindowMs - time)) / 1000);
      set.status = 429;
      set.headers["retry-after"] = String(retryAfter);
      return { error: "Too many requests. Please try again later.", retryAfter };
    }
    keys.forEach((key, index) => recent.set(key, [...history[index]!, time]));
    if (recent.size > 5000) for (const [key, times] of recent) if (times.every(at => time - at >= consultationWindowMs)) recent.delete(key);

    await send({ name: body.name, phone: body.phone, note: body.note });
    set.status = 201;
    return { ok: true };
  }, { body: consultationBody });
}
