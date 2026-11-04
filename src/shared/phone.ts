import { z } from "zod";

export const phoneSchema = z.string().trim().max(32)
  .regex(/^\+?[\d\s()-]+$/, "Enter a valid phone number with country code")
  .transform(value => value.replace(/[\s()-]/g, ""))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, "Include the country code, for example +994501234567"));
