import { afterAll, beforeAll, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readdir } from "node:fs/promises";
import { assertRuntimeDatabaseAccess } from "../src/database-access";

const db = new PGlite();
const query = async (sql: string) => (await db.query<{ reason: string }>(sql)).rows;
const permissions = await Bun.file(new URL("../scripts/sql/runtime-permissions.sql", import.meta.url)).text();
beforeAll(async () => {
  const root = new URL("../prisma/migrations/", import.meta.url);
  for (const entry of (await readdir(root, { withFileTypes: true })).filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    await db.exec(await Bun.file(new URL(`${entry.name}/migration.sql`, root)).text());
  }
  await db.exec('CREATE TABLE public._prisma_migrations (id text PRIMARY KEY)');
  await db.exec(await Bun.file(new URL("../scripts/sql/runtime-role.sql", import.meta.url)).text());
  await db.exec(permissions);
  await db.exec(permissions); // Reapplying grants must be safe.
}, 30000);
afterAll(() => db.close());

async function asRuntime(work: () => Promise<void>) {
  await db.exec("SET SESSION AUTHORIZATION school_app");
  // PGlite resets the session default between commands; restore the harness
  // administrator explicitly instead of RESET SESSION AUTHORIZATION.
  try { await work(); } finally { await db.exec("SET SESSION AUTHORIZATION postgres"); }
}

test("owner credentials are rejected; restricted runtime credentials pass", async () => {
  await expect(assertRuntimeDatabaseAccess(query)).rejects.toThrow("Unsafe runtime database access");
  await asRuntime(() => assertRuntimeDatabaseAccess(query));
});

test("backend can create, read, update, and delete auth/profile/notification records through RLS", async () => {
  await asRuntime(async () => {
    const id = crypto.randomUUID();
    await db.query('INSERT INTO auth_users (id, name, email, "updatedAt") VALUES ($1, $2, $3, now())', [id, "Runtime test", `${id}@example.test`]);
    await db.query("INSERT INTO profiles (id, role, updated_at) VALUES ($1, 'student', now())", [id]);
    await db.query("INSERT INTO notifications (id, user_id, title, message) VALUES ($1, $2, 'Test', 'Hello')", [crypto.randomUUID(), id]);
    expect((await db.query("SELECT * FROM notifications WHERE user_id=$1", [id])).rows).toHaveLength(1);
    await db.query("UPDATE notifications SET is_read=true WHERE user_id=$1", [id]);
    expect((await db.query<{ is_read: boolean }>("SELECT is_read FROM notifications WHERE user_id=$1", [id])).rows[0].is_read).toBe(true);
    await db.query("DELETE FROM auth_users WHERE id=$1", [id]);
    expect((await db.query("SELECT * FROM notifications WHERE user_id=$1", [id])).rows).toHaveLength(0);
  });
});

test("every migrated application table has only CRUD grants and a backend RLS policy", async () => {
  const tables = (await db.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'")).rows;
  expect(tables.length).toBeGreaterThan(20);
  for (const { tablename } of tables) {
    if (tablename === "audit_logs") {
      const access = await db.query<{ readable: boolean; writable: boolean }>("SELECT has_table_privilege('school_app', 'audit_logs', 'SELECT') AS readable, has_table_privilege('school_app', 'audit_logs', 'INSERT, UPDATE, DELETE, TRUNCATE') AS writable");
      expect(access.rows[0]).toEqual({ readable: true, writable: false });
      continue;
    }
    const grants = await db.query<{ allowed: boolean }>("SELECT has_table_privilege('school_app', $1, 'SELECT') AND has_table_privilege('school_app', $1, 'INSERT') AND has_table_privilege('school_app', $1, 'UPDATE') AND has_table_privilege('school_app', $1, 'DELETE') AS allowed", [tablename]);
    expect(grants.rows[0].allowed).toBe(true);
    const policies = await db.query("SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=$1 AND policyname='school_backend_access' AND roles=ARRAY['school_runtime']::name[]", [tablename]);
    expect(policies.rows).toHaveLength(1);
  }
});

test("runtime cannot change schema, truncate records, grant privileges, or access migration history", async () => {
  await asRuntime(async () => {
    for (const sql of [
      "CREATE TABLE public.forbidden (id int)", "CREATE SCHEMA forbidden",
      "ALTER TABLE profiles ADD COLUMN forbidden text", "DROP TABLE push_deliveries",
      "TRUNCATE notifications", "ALTER TABLE profiles DISABLE ROW LEVEL SECURITY",
      "SELECT * FROM _prisma_migrations", "DELETE FROM _prisma_migrations",
      "CREATE ROLE forbidden", "ALTER ROLE school_app SUPERUSER", "SET ROLE postgres",
    ]) await expect(db.exec(sql)).rejects.toThrow();
    // PostgreSQL warns instead of throwing for an ineffective GRANT.
    await db.exec("GRANT SELECT ON profiles TO PUBLIC");
  });
  const publicGrants = await db.query("SELECT FROM information_schema.role_table_grants WHERE table_name='profiles' AND grantee='PUBLIC'");
  expect(publicGrants.rows).toHaveLength(0);
});

test("new tables and anonymous roles remain denied", async () => {
  await db.exec("CREATE TABLE future_feature (id int); CREATE ROLE unrelated_reader; GRANT USAGE ON SCHEMA public TO unrelated_reader; GRANT SELECT ON profiles TO unrelated_reader;");
  await asRuntime(async () => { await expect(db.exec("SELECT * FROM future_feature")).rejects.toThrow(); });
  await db.exec("SET SESSION AUTHORIZATION unrelated_reader");
  try { expect((await db.query("SELECT * FROM profiles")).rows).toHaveLength(0); }
  finally { await db.exec("SET SESSION AUTHORIZATION postgres; DROP TABLE future_feature"); }
});

test("startup detects inherited privilege escalation", async () => {
  await db.exec("CREATE ROLE dangerous_owner CREATEDB; GRANT dangerous_owner TO school_app");
  try { await asRuntime(async () => { await expect(assertRuntimeDatabaseAccess(query)).rejects.toThrow("Elevated role"); }); }
  finally { await db.exec("REVOKE dangerous_owner FROM school_app"); }
});

test("migration owner can still evolve tables after runtime restrictions", async () => {
  await db.exec("ALTER TABLE notifications ADD COLUMN permission_test text; ALTER TABLE notifications DROP COLUMN permission_test");
});

test("owner login cannot hide behind SET ROLE", async () => {
  await db.exec("SET ROLE school_app");
  try {
    await expect(assertRuntimeDatabaseAccess(query)).rejects.toThrow("Unexpected database login");
  } finally {
    await db.exec("RESET ROLE");
  }
});

test("startup detects column-level migration history access", async () => {
  await db.exec("GRANT SELECT (id) ON _prisma_migrations TO school_app");
  try {
    await asRuntime(async () => {
      await expect(assertRuntimeDatabaseAccess(query)).rejects.toThrow("access to migration history");
    });
  } finally {
    await db.exec("REVOKE SELECT (id) ON _prisma_migrations FROM school_app");
  }
});

test("startup detects column-level delegation and administration", async () => {
  for (const [privilege, reason] of [
    ["SELECT (id)", "delegate table privileges"],
    ["REFERENCES (id)", "table administration privileges"],
  ]) {
    await db.exec(`GRANT ${privilege} ON profiles TO school_app WITH GRANT OPTION`);
    try {
      await asRuntime(async () => {
        await expect(assertRuntimeDatabaseAccess(query)).rejects.toThrow(reason);
      });
    } finally {
      await db.exec(`REVOKE ${privilege} ON profiles FROM school_app`);
    }
  }
});

test("startup requires RLS for write-only and column-readable tables", async () => {
  await db.exec("CREATE TABLE access_probe (id int)");
  try {
    for (const privilege of ["INSERT", "UPDATE", "DELETE", "SELECT (id)"]) {
      await db.exec(`GRANT ${privilege} ON access_probe TO school_app`);
      try {
        await asRuntime(async () => {
          await expect(assertRuntimeDatabaseAccess(query)).rejects.toThrow("must have RLS enabled");
        });
      } finally {
        await db.exec(`REVOKE ${privilege} ON access_probe FROM school_app`);
      }
    }
  } finally {
    await db.exec("DROP TABLE access_probe");
  }
  await asRuntime(() => assertRuntimeDatabaseAccess(query));
});
