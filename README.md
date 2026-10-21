# SSL School

Private school-management API built with TypeScript, Bun, Elysia, Zod,
Prisma 7, PostgreSQL, and Better Auth. Supabase `ssl school` was inspected as
a draft schema reference on 2026-10-16; it is not this application's database.

## Implemented

- Eleven school models and four Better Auth models, with reproducible SQL migrations.
- Public email/password signup always creates a student profile.
- Admin-only student promotion to teacher or manager; teacher creation is admin-only.
- Better Auth email/password login, sessions, logout, and Expo plugin.
- Expo signup/sign-in screens with validation, session restoration, and logout.
- Operator password recovery with transactional session revocation.
- Authenticated profile, role-scoped course/enrollment lists, staff course creation,
  and staff enrollment creation. Enrollment teacher IDs come from the course.
- Student creation and profile updates for admins/managers, plus
  scoped list/detail endpoints. See [people management](docs/people-management.md).
- Zod contracts, bounded pagination, decimal-string money, and safe API errors.
- SQL constraint tests using disposable PGlite, plus HTTP authorization and auth tests.

This is the first backend milestone, not the complete mobile app. Lesson/progress/
payment/notification tables exist, but their API routes and screens are still pending.
Invitation email, password reset email, uploads, scheduling conflict prevention,
audit trails, deployment, and school dashboard screens remain on the roadmap.

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

Public signup creates students only; there is no default admin password. The local operator command
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
| GET/POST | `/api/auth/*` | Better Auth handlers; public signup creates students only |
| PATCH | `/api/users/:id/role` | Admin only; promote a student to teacher or manager |
| GET | `/api/me` | Own profile |
| GET | `/api/students` and `/api/students/:id` | Staff: all; teachers: assigned students; students: own |
| POST | `/api/students` | Admin/manager; creates student account |
| PATCH | `/api/students/:id` | Admin/manager |
| GET | `/api/teachers` and `/api/teachers/:id` | Staff: all; teachers: own; students: denied |
| POST | `/api/teachers` | Admin only; creates teacher account |
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
tests inject a database/session boundary and verify access filters. The signup
validation test exercises the actual Better Auth handler.

With a development database configured, run `bun scripts/check-admin-flow.ts` to
check login, school workflows, password recovery, student signup, and admin-only
promotions against PostgreSQL. It creates and removes its own temporary records.

## Signup and role assignment

Send `name`, `email`, and a 12–128 character `password` to
`POST /api/auth/sign-up/email`. Better Auth returns a session; `/api/me` returns
the student's school profile. Supplied role fields cannot grant privileges.
The signup display name is stored in the profile's firstName field.

An authenticated admin can promote an existing student using their **profile/user ID**
(not the student record ID):

```text
PATCH /api/users/<profile-id>/role
{ "role": "teacher", "specialization": "English" }

PATCH /api/users/<profile-id>/role
{ "role": "manager" }
```

Promotions preserve student history and revoke the user's sessions, so they must
sign in again. This endpoint accepts only student-to-teacher/manager promotions;
it does not grant admin access or change existing staff roles. Managers cannot
promote users or create teachers. Trusted server operators retain the bootstrap CLI.
Study-time availability questions remain a future onboarding step.

## Team workflow

Developer A owns database/auth, Developer B owns school endpoints; review each
other's changes. Create migrations against a local database with `bun run db:dev`;
deploy reviewed migrations with `bun run db:migrate`. Never edit an applied migration.
Commit schema, migrations, package manifests, and lockfile together. Generated Prisma
files and secrets are ignored. CI generates Prisma Client before type checking.

See [schema decisions](docs/schema-decisions.md) and [roadmap](docs/roadmap.md).

## Signup and sign-in screens

The Expo app lives in `mobile/`. It provides student signup (full name, email,
password, confirmation), sign-in, password visibility, validation, loading/error
states, session restoration, an account welcome screen, and logout. Native sessions
use Expo SecureStore through the Better Auth Expo client; web sessions use cookies.

Start the API in one terminal with `bun run dev`, then in another:

```sh
bun run mobile:web -- --port 8081
```

Open `http://localhost:8081`. Set `EXPO_PUBLIC_API_URL` in `.env` to the API address
(default `http://localhost:3000`), set `BETTER_AUTH_URL` to that same API address,
and include `http://localhost:8081` in `TRUSTED_ORIGINS`. Restart both processes
when changing environment values. Only `EXPO_PUBLIC_API_URL` is intended for the
client; never prefix database credentials or auth secrets with `EXPO_PUBLIC_`.

For native preview, run `bun run mobile:start`. Use a reachable LAN API address
on physical devices and include `sslschool://` in trusted origins. Native device
session storage still needs an on-device check. Learning availability questions
and full role dashboards are future work; the welcome screen displays the server's
assigned role. New users cannot choose their role on the signup form.
