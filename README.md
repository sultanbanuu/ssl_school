# SSL School

Private school-management API built with TypeScript, Bun, Elysia, Zod,
Prisma 7, PostgreSQL, and Better Auth. Supabase `ssl school` was inspected as
a draft schema reference on 2026-10-16; it is not this application's database.

## Implemented

- Eleven school models and four Better Auth models, with reproducible SQL migrations.
- Closed public signup; operator-only account creation for all four roles.
- Better Auth email/password login, sessions, logout, and Expo plugin.
- Operator password recovery with transactional session revocation.
- Authenticated profile, role-scoped course/enrollment lists, staff course creation,
  and staff enrollment creation. Enrollment teacher IDs come from the course.
- Student/teacher account creation and profile updates for admins/managers, plus
  scoped list/detail endpoints. See [people management](docs/people-management.md).
- Zod contracts, bounded pagination, decimal-string money, and safe API errors.
- SQL constraint tests using disposable PGlite, plus HTTP authorization and auth tests.

This is the first backend milestone, not the complete mobile app. Lesson/progress/
payment/notification tables exist, but their API routes and screens are still pending.
Invitation email, password reset email, uploads, scheduling conflict prevention,
audit trails, deployment, and Expo UI remain on the roadmap.

## Start locally

Requires Bun and Node.js/npm for the pinned toolchain. Dependencies are committed
in package-lock.json. npm installs dependencies; Bun runs the application and tests.

```sh
npm ci
bun run db:generate
```

Copy `.env.example` to `.env`, generate a fresh auth secret using the command in
that file, and configure a **new** PostgreSQL database. Do not use the draft
Supabase connection. With Docker installed, the included database starts with:

```sh
docker compose up -d
bun run db:migrate
bun run dev
```

Docker is optional: any separate PostgreSQL 17 development database can be used.
DATABASE_URL is the API connection; DIRECT_URL is the migration connection.
Keep both credentials server-side. This starter uses a trusted table-owner backend
connection. RLS deliberately has no public policies, so a non-owner runtime role
requires a separately designed grant/policy setup. A migration admin connection
and an API runtime role should be separated before deployment.

On a physical phone, configure a reachable API URL and matching trusted origins;
`localhost` on the phone is the phone itself. HTTPS is required for production.

## Provision the first account

There is no public signup and no default admin password. The local operator command
creates the auth user, credential account, profile, and role record in one transaction.
It reads JSON from stdin so passwords do not need to appear in command arguments.

PowerShell example (password is prompted, not entered into shell history):

```powershell
$schoolCredential = Get-Credential -Message 'New school account email and password'
@{
  email = $schoolCredential.UserName
  password = $schoolCredential.GetNetworkCredential().Password
  firstName = 'School'
  lastName = 'Administrator'
  role = 'admin'
} | ConvertTo-Json -Compress | bun run account:create
Remove-Variable schoolCredential
```

Use `student`, `manager`, or `teacher` for the other account types. Teachers also
require `specialization`. Passwords must contain 12–128 characters. Provisioning
does not send email; arrange initial credential delivery privately. Email verification
and recovery delivery must be added before the student pilot.

## Recover a password

An operator with server/database access can reset an existing password account.
The command accepts JSON through stdin and revokes all sessions for that user in
the same transaction. The user must sign in again with the new password.

```powershell
$schoolCredential = Get-Credential -Message 'Existing school account email and new password'
@{
  email = $schoolCredential.UserName
  password = $schoolCredential.GetNetworkCredential().Password
} | ConvertTo-Json -Compress | bun run account:reset-password
Remove-Variable schoolCredential
```

Passwords must contain 12–128 characters. The command prints only the user ID and
number of revoked sessions. It does not send email; deliver the replacement
credential privately. Self-service email recovery remains pending.

## Routes

| Method | Route | Access |
| --- | --- | --- |
| GET | `/health` | Process liveness |
| GET | `/ready` | Database readiness; 503 when unavailable |
| GET/POST | `/api/auth/*` | Better Auth handlers; public signup disabled |
| GET | `/api/me` | Own profile |
| GET | `/api/students` and `/api/students/:id` | Staff: all; teachers: assigned students; students: own |
| POST | `/api/students` | Admin/manager; creates student account |
| PATCH | `/api/students/:id` | Admin/manager |
| GET | `/api/teachers` and `/api/teachers/:id` | Staff: all; teachers: own; students: denied |
| POST | `/api/teachers` | Admin/manager; creates teacher account |
| PATCH | `/api/teachers/:id` | Admin/manager |
| GET | `/api/courses` | Students: active courses; teachers: assigned courses; staff: all |
| POST | `/api/courses` | Admin/manager |
| GET | `/api/enrollments` | Students: own; teachers: assigned; staff: all |
| POST | `/api/enrollments` | Admin/manager |

List endpoints accept `limit` (1–100, default 25) and `offset` (default 0).
Course price is a decimal string, for example `"50.00"`. Duration is optional and
serialized as a string to preserve the draft's bigint type. Its business unit is
not established by the draft and must be agreed before adding the course form.

Example course body:

```json
{
  "name": "General English",
  "category": "English",
  "price": "50.00",
  "teacherId": "UUID_OF_EXISTING_TEACHER"
}
```

Enrollment body: `{ "studentId": "...", "courseId": "..." }`.
Teacher overrides are rejected. Only active students and courses can be enrolled.
Duplicate enrollment returns 409; invalid bodies return 422; unauthenticated
requests return 401; unauthorized roles return 403.

## Validation

```sh
bun run db:validate
bun run typecheck
bun test
```

PGlite tests apply all committed migrations to a disposable PostgreSQL engine.
They test constraints and anonymous RLS isolation without touching Supabase. API
tests inject a database/session boundary and verify access filters. The closed-signup
test exercises the actual Better Auth handler. These do not yet verify a full
login-to-Prisma workflow against a network PostgreSQL server; run that integration
after provisioning the development database.

## Team workflow

Developer A owns database/auth, Developer B owns school endpoints; review each
other's changes. Create migrations against a local database with `bun run db:dev`;
deploy reviewed migrations with `bun run db:migrate`. Never edit an applied migration.
Commit schema, migrations, package manifests, and lockfile together. Generated Prisma
files and secrets are ignored. CI generates Prisma Client before type checking.

See [schema decisions](docs/schema-decisions.md) and [roadmap](docs/roadmap.md).
