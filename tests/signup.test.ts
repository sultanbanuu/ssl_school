import { expect, test } from "bun:test";
import { birthDateSchema, learningTimeOptions, learningTimeSchema, signupName } from "../src/modules/auth/schemas";

test("signup requires real, non-future birth dates", () => {
  for (const value of ["", "2001-02-29", "2000-04-31", "2000-13-01", "2999-01-01", "01/02/2000"]) {
    expect(birthDateSchema.safeParse(value).success).toBe(false);
  }
  expect(birthDateSchema.safeParse("2000-02-29").success).toBe(true);
});

test("signup accepts all six learning choices and rejects missing or arbitrary answers", () => {
  for (const option of learningTimeOptions) expect(learningTimeSchema.safeParse(option).success).toBe(true);
  expect(learningTimeSchema.safeParse("").success).toBe(false);
  expect(learningTimeSchema.safeParse("6hr").success).toBe(false);
  expect(signupName.safeParse("  ").success).toBe(false);
  expect(signupName.parse("  Mary Jane  ")).toBe("Mary Jane");
});
