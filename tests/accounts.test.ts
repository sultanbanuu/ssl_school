import { expect, test } from "bun:test";
import { verifyPassword } from "better-auth/crypto";
import { resetAccountPassword } from "../src/accounts";
import type { PrismaClient } from "../src/generated/prisma/client";

function fixture(options: { missing?: boolean; credentials?: number; revokeFailure?: boolean } = {}) {
  const calls: { name: string; args: any }[] = [];
  let committed = false;
  const tx = {
    user: { findUnique: async (args: any) => {
      calls.push({ name: "user", args });
      return options.missing ? null : { id: "target-user" };
    } },
    account: { updateMany: async (args: any) => {
      calls.push({ name: "password", args });
      return { count: options.credentials ?? 1 };
    } },
    session: { deleteMany: async (args: any) => {
      calls.push({ name: "sessions", args });
      if (options.revokeFailure) throw new Error("Database unavailable");
      return { count: 2 };
    } },
  };
  const db = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
    const result = await callback(tx);
    committed = true;
    return result;
  } } as unknown as PrismaClient;
  return { db, calls, committed: () => committed };
}

const input = { email: "Student@Example.test", password: "new-long-password-123" };

test("operator recovery hashes the password and revokes only the target user's sessions", async () => {
  const f = fixture();
  expect(await resetAccountPassword(f.db, input)).toEqual({ id: "target-user", revokedSessions: 2 });
  expect(f.calls[0].args).toEqual({ where: { email: "student@example.test" }, select: { id: true } });
  expect(f.calls[1].args.where).toEqual({ userId: "target-user", providerId: "credential" });
  const hash = f.calls[1].args.data.password;
  expect(hash).not.toBe(input.password);
  expect(await verifyPassword({ hash, password: input.password })).toBe(true);
  expect(await verifyPassword({ hash, password: "wrong-password" })).toBe(false);
  expect(f.calls[2].args).toEqual({ where: { userId: "target-user" } });
  expect(f.committed()).toBe(true);
});

test("invalid recovery input is rejected before opening a transaction", async () => {
  const f = fixture();
  for (const value of [
    { ...input, password: "short" }, { ...input, password: "x".repeat(129) },
    { ...input, email: "invalid" }, { ...input, role: "admin" },
  ]) await expect(resetAccountPassword(f.db, value)).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
  expect(f.committed()).toBe(false);
});

test("missing users and missing or duplicate credentials abort recovery", async () => {
  for (const options of [{ missing: true }, { credentials: 0 }, { credentials: 2 }]) {
    const f = fixture(options);
    await expect(resetAccountPassword(f.db, input)).rejects.toThrow();
    expect(f.calls.some(call => call.name === "sessions")).toBe(false);
    expect(f.committed()).toBe(false);
  }
});

test("session revocation failure rejects the password transaction", async () => {
  const f = fixture({ revokeFailure: true });
  await expect(resetAccountPassword(f.db, input)).rejects.toThrow("Database unavailable");
  expect(f.committed()).toBe(false);
});
