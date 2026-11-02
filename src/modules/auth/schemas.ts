import { z } from "zod";

export const learningTimeOptions = [
  "Have no time",
  "0-1hr",
  "1hr-2hr",
  "2hr-3hr",
  "3hr-4hr",
  "4hr-5hr",
] as const;
export const signupName = z
  .string()
  .trim()
  .min(1, "Enter your name and surname.")
  .max(160);
export const birthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD for your birth date.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value &&
      value >= "1900-01-01" &&
      value <= new Date().toISOString().slice(0, 10)
    );
  }, "Enter a valid birth date that is not in the future.");
export const learningTimeSchema = z.enum(learningTimeOptions);
