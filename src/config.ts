import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.string().url().refine((v) => /^postgres(ql)?:/.test(v), "PostgreSQL URL required"),
  BETTER_AUTH_SECRET: z.string().min(32).refine((v) => !v.startsWith("replace-"), "Generate a real auth secret"),
  BETTER_AUTH_URL: z.string().url(),
  TRUSTED_ORIGINS: z.string().min(1).transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});
export type Config = z.infer<typeof envSchema>;
export function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) throw new Error(`Invalid environment: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  if (result.data.NODE_ENV === "production" && !result.data.BETTER_AUTH_URL.startsWith("https://")) {
    throw new Error("Production authentication requires HTTPS");
  }
  return result.data;
}
