// Keep this query static: callers execute it through both Prisma and pg.
export const runtimeAccessQuery = `
WITH RECURSIVE reachable AS (
  SELECT oid, rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
  FROM pg_roles
  WHERE rolname = current_user

  UNION

  SELECT role.oid, role.rolname, role.rolsuper, role.rolcreatedb,
    role.rolcreaterole, role.rolreplication, role.rolbypassrls
  FROM pg_roles role
  JOIN pg_auth_members membership ON membership.roleid = role.oid
  JOIN reachable parent ON parent.oid = membership.member
), public_tables AS (
  SELECT oid, relname, relrowsecurity
  FROM pg_class
  WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p')
), table_access AS (
  SELECT *,
    has_any_column_privilege(oid, 'SELECT, INSERT, UPDATE')
      OR has_table_privilege(oid, 'DELETE') AS has_crud,
    has_table_privilege(oid, 'TRUNCATE, TRIGGER')
      OR has_any_column_privilege(oid, 'REFERENCES') AS has_administration,
    has_any_column_privilege(oid,
      'SELECT WITH GRANT OPTION, INSERT WITH GRANT OPTION, UPDATE WITH GRANT OPTION')
      OR has_table_privilege(oid, 'DELETE WITH GRANT OPTION') AS can_delegate
  FROM public_tables
), violations AS (
  SELECT 'Unexpected database login (expected school_app)' AS reason
  WHERE session_user <> 'school_app' OR current_user <> 'school_app'

  UNION ALL
  SELECT 'Elevated role or unexpected role membership'
  FROM reachable
  WHERE rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
    OR rolname NOT IN ('school_app', 'school_runtime')

  UNION ALL
  SELECT 'Runtime must not own database objects'
  WHERE EXISTS (
    SELECT FROM pg_class
    WHERE relnamespace = 'public'::regnamespace AND relowner IN (SELECT oid FROM reachable)
  ) OR EXISTS (
    SELECT FROM pg_namespace WHERE nspowner IN (SELECT oid FROM reachable)
  ) OR EXISTS (
    SELECT FROM pg_database
    WHERE datname = current_database() AND datdba IN (SELECT oid FROM reachable)
  )

  UNION ALL
  SELECT 'Runtime must not create schemas or public tables'
  WHERE has_database_privilege(current_database(), 'CREATE')
    OR has_schema_privilege('public', 'CREATE')

  UNION ALL
  SELECT 'Missing school_runtime membership'
  WHERE NOT EXISTS (SELECT FROM reachable WHERE rolname = 'school_runtime')

  UNION ALL
  SELECT 'Runtime has access to migration history'
  WHERE EXISTS (
    SELECT FROM table_access WHERE relname = '_prisma_migrations' AND has_crud
  )

  UNION ALL
  SELECT 'Runtime must not write audit history directly'
  WHERE EXISTS (
    SELECT FROM public_tables WHERE relname = 'audit_logs'
      AND (has_any_column_privilege(oid, 'INSERT, UPDATE') OR has_table_privilege(oid, 'DELETE'))
  )

  UNION ALL
  SELECT 'Runtime has table administration privileges'
  WHERE EXISTS (SELECT FROM table_access WHERE has_administration)

  UNION ALL
  SELECT 'Runtime can delegate table privileges'
  WHERE EXISTS (SELECT FROM table_access WHERE can_delegate)

  UNION ALL
  SELECT 'Runtime-accessible application tables must have RLS enabled'
  WHERE EXISTS (
    SELECT FROM table_access
    WHERE relname <> '_prisma_migrations' AND has_crud AND NOT relrowsecurity
  )
)
SELECT DISTINCT reason FROM violations ORDER BY reason`;

type AccessViolation = { reason: string };
type AccessQuery = (sql: string) => Promise<AccessViolation[]>;

export async function assertRuntimeDatabaseAccess(query: AccessQuery): Promise<void> {
  const violations = await query(runtimeAccessQuery);
  if (violations.length === 0) return;

  const reasons = violations.map(({ reason }) => reason).join('; ');
  throw new Error(`Unsafe runtime database access: ${reasons}. See docs/database-access.md.`);
}
