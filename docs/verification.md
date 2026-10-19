# Verification — 2026-10-16

## Update — 2026-10-17

Student/teacher management added. TypeScript checking and all 28 tests (70 assertions)
pass. New tests cover provisioning and password hash verification, duplicate emails,
fixed role enforcement, scoped reads, hidden contact fields, staff-only writes,
and profile/auth-name updates. Route tests use an injected database boundary; they
verify calls share the transaction callback, not real-server transaction rollback.
The user's earlier manual check confirmed admin login and `/api/me` against their
local server. The new people endpoints have not been exercised against that server
with real records by the agent. No new migration is needed.

## Original foundation checks

Passed locally:
- Prisma Client generation (Prisma 7.10.1).
- Prisma schema validation.
- TypeScript checking.
- 17 Bun tests, 23 assertions: request authorization, payload validation,
  disabled public signup, migration application, unique constraints, foreign keys,
  nonnegative payments, and RLS denial for an unprivileged role.
- npm dependency audit: no reported vulnerabilities at install time.

Database tests use PGlite, a disposable PostgreSQL WASM engine. No writes were made
to the source Supabase project. A network PostgreSQL server is not configured here,
and neither Docker nor a PostgreSQL installation was found in the environment.

Not yet verified: account provisioning plus real login/session/logout through Prisma
against a network PostgreSQL server; Expo authentication on a physical phone;
hosted/private release. These are explicit next integration checkpoints.

Tooling note: Bun's dependency installer could not access its temporary directory in
this Windows environment. Dependencies were successfully installed and pinned with
npm, and Bun successfully runs the app toolchain/tests. Use package-lock.json with
`npm ci` for reproducible installation.
