# School workflow — verified 2026-10-21

Status: backend workflow verified through real HTTP requests and PostgreSQL.

`bun run check:school` exercises admin sign-in; teacher and student creation; updates
to both records; detail reads; authentication display-name synchronization; course
creation with teacher assignment; and student enrollment. It checks that the stored
course/enrollment/student/teacher relationships match. Duplicate emails/enrollments,
missing teachers, inactive students, and enrollment teacher overrides are rejected.
Sign-out is followed by an unauthorized read check. All temporary records were removed.

The configured API address timed out during this run. Verification used a temporary
local server on port 3001 against the configured database, with process-only settings:

```sh
BETTER_AUTH_URL=http://localhost:3001 PORT=3001 bun src/index.ts
# In another terminal:
BETTER_AUTH_URL=http://localhost:3001 PORT=3001 bun run check:school
```

No environment files or existing school records were changed. This verifies the
backend workflow; an admin completing it through management screens remains pending
because those screens are not implemented. Teacher assignment is part of course
creation; changing an existing course's teacher is outside this check.

---

# Update — 2026-10-21

Student self-signup remains enabled by user choice; public signup always creates a
student. Teacher/manager promotion is admin-only and admin provisioning uses the
operator CLI.

Added role-route regression tests for authorization, role injection, conditional
promotion, and target-only session revocation. The mobile app now returns to sign-in
when profile loading reports an expired session.

Expanded `scripts/check-admin-flow.ts` to check session restoration and logout for
all four roles, session expiry, student isolation, and teacher assignment boundaries.
Live integration checks PASSED against the configured PostgreSQL database on
2026-10-21. The earlier connection failure came from restricted tool network access;
retrying with local network access succeeded. All temporary test records were removed.
The script checks connectivity before provisioning accounts.

Verified: login, session restoration, and logout for admin/manager/teacher/student;
expired-session rejection; student and teacher record isolation; restricted staff
creation and promotion; student-only public signup despite supplied privilege fields;
password recovery, old-password rejection, and session revocation.

Unit/database checks: 37 Bun tests pass; TypeScript checking passes. API tests use
injected boundaries; PGlite tests exercise real SQL constraints. The live integration
script additionally exercises the real authentication handlers, Prisma, and PostgreSQL.
Backend authentication and the existing record permission checks pass. Native Expo
session storage still needs an on-device check; browser UI reload behavior has not
been exercised by this integration script.

---

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
