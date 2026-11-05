# Database access separation

The API uses **school_app**, a login that inherits the **school_runtime** group.
It has SELECT, INSERT, UPDATE and DELETE on the reviewed application tables
(audit_logs is SELECT-only), but
does not own tables, bypass RLS, change schemas, truncate tables, create roles,
or read/write Prisma's migration history. API startup checks these restrictions.

The migration connection uses a different database/table owner. It is only used
by Prisma and permission provisioning. PostgreSQL roles are distinct from the
app's student/teacher/manager/admin roles. The backend still enforces user access:
the runtime RLS policy permits the trusted server to access application rows.
It is not per-student RLS and its password must never reach a browser or phone.

## Local setup

1. Keep DATABASE_URL in the ignored `.env` file. Copy `.env.migrations.example`
   to `.env.migrations` and set DIRECT_URL to your existing database owner URL.
   Move DIRECT_URL out of `.env`. Do not commit either secret file.
2. Run `bun run db:generate` and `bun run db:migrate` with the owner connection.
3. Provision the runtime role using a new password of at least 32 characters.
   PowerShell example (password is prompted, not stored in command history):

   ```powershell
   $schoolRuntimeCredential = Get-Credential -UserName school_app -Message 'New runtime database password (at least 32 characters)'
   @{ password = $schoolRuntimeCredential.GetNetworkCredential().Password } | ConvertTo-Json -Compress | bun run db:setup-runtime
   Remove-Variable schoolRuntimeCredential
   ```

   This command needs an administrator that can create roles and change policies
   on the app's tables. It grants access only to the explicitly reviewed table
   list. It also revokes PUBLIC CREATE on the public schema and PUBLIC access to
   application tables, so use a dedicated school database, not a shared schema.
4. Set DATABASE_URL to the same database with username school_app and the new
   password. URL-encode special password characters. Keep DIRECT_URL unchanged
   in `.env.migrations`; never give school_app membership in the owner role.
5. Run `bun run db:check-access`, then `bun run dev`. Startup no longer runs
   migrations, even in development. Apply migrations explicitly before restart.

Existing compose installations may keep their original school owner credentials;
there is no need to replace a volume or delete existing data. Outside compose,
use the actual database name/owner rather than copying example URLs blindly.

## Deployment and later migrations

Use separate secret scopes: the API gets DATABASE_URL only; the release/migration
job gets DIRECT_URL. Prisma never falls back to DATABASE_URL. Generate/validate
can run without database credentials; migration commands require DIRECT_URL.
The API does not read `.env.migrations`; do not package that file into its image.

Run `bun run db:migrate`, then `bun run db:permissions` as the migration owner,
then `bun run db:check-access` with runtime credentials before starting the API.
Initial role creation needs CREATEROLE/admin access; normal permission updates
need table ownership and the ability to grant schema USAGE. A managed host may
require an administrator to provision the roles first.

When adding a table, explicitly add it to scripts/sql/runtime-permissions.sql.
Future tables receive no automatic runtime grants. Existing grants/policies stay
in place after ordinary migrations; new columns inherit table-level access.
The database permission tests catch new tables missing from the reviewed list.
Current IDs use UUID defaults, so no sequence privileges are needed.

The setup command does not silently remove pre-existing elevated memberships or
transfer object ownership. The check rejects those configurations for review.
For password rotation, rerun setup with the new password and update the API secret
together; existing pooled connections may remain valid until restarted.

## Verification

`bun test tests/database-access.test.ts` applies real migrations to a disposable
PostgreSQL-compatible PGlite database and tests backend CRUD, RLS, forbidden DDL,
TRUNCATE, role escalation, migration-history denial, anonymous denial, and future
table isolation. It also checks that the owner can still change the schema.

`bun run db:check-access` checks the configured connection without changing school
records. `bun scripts/check-admin-flow.ts` is an opt-in integration smoke test that
creates and cleans up temporary records for signup, login, roles and school flows.
