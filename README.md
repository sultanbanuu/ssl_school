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

The app combines signup/sign-in, role-scoped lesson scheduling, monthly payment
submissions with private R2 receipts and admin review, and in-app notification
inboxes with staff announcements. See [payments](docs/payments.md),
[notifications](docs/notifications.md), and [mobile setup](mobile/README.md).
Progress tracking, invitation email, password reset email, non-receipt uploads,
audit trails, deployment, and full management dashboards remain on the roadmap.

## Backend organization

All endpoints are organized by feature under `src/modules`:

```text
src/
  app.ts
  modules/
    auth/
    availability/
    courses/
    enrollments/
    health/
    lessons/
    notifications/
    payments/
      routes.ts
      schemas.ts
      service.ts
    people/
    profile/
    roles/
  shared/
    account-schemas.ts
    authorization.ts
    pagination.ts
prisma/
  schema.prisma
```

Each feature follows the payment module's layout. `routes.ts` registers endpoints, resolves the authenticated actor,
and sets HTTP statuses and headers. `schemas.ts` defines Zod validation for
request bodies, parameters, and queries. `service.ts` handles access rules,
business logic, database transactions, and response data without depending on
the HTTP request context. Services infer their input types from the schemas.
Health and profile have no request inputs, so they need no `schemas.ts`.
The auth module delegates its wildcard routes to Better Auth and keeps signup
validation in `schemas.ts`, with auth setup and actor resolution in `service.ts`.

`app.ts` assembles the feature routes, CORS, and shared error handling. Shared
authorization and pagination live in `src/shared`; database models remain in
`prisma/schema.prisma`. Students, teachers, and the scheduling directory live in
`people`; availability and trial bookings live in `availability`. Operator account
provisioning remains in `src/accounts.ts`, using `shared/account-schemas.ts`.

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
In development, API startup (including watch restarts) applies existing pending
migrations before accepting requests. Startup and `/ready` also verify that the
generated auth-user fields exist in the database. Production deployments must
still run `bun run db:generate` and `bun run db:migrate` explicitly.
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
states, session restoration, a role-scoped lesson schedule, and logout. Native sessions
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

## Lesson scheduling

The signed-in Expo screen lists the user's lessons with paging and refresh.
Students see their own lessons; teachers see their assigned schedules; admins and
managers see all lessons and can create lessons from existing enrollments.
Staff and assigned teachers can reschedule, cancel, or mark scheduled lessons
completed. Completed and cancelled lessons are retained and cannot be changed.

- `GET /api/lessons`: scoped list with `limit`, `offset`, optional `from`/`to`
  inclusive dates, and `status` (`scheduled`, `completed`, `cancelled`).
- `POST /api/lessons`: admin/manager only. Body:
  `{ "enrollmentId": "UUID", "date": "2026-11-02", "startTime": "10:00", "endTime": "11:00" }`.
- `PATCH /api/lessons/:id`: staff or assigned teacher. Supply either all three
  date/time fields to reschedule, or `{ "status": "cancelled" }` /
  `{ "status": "completed" }`.

Dates/times are school-local wall clock values in Asia/Baku, using 24-hour time.
An end time is required for new bookings and reschedules; lessons cannot cross
midnight. Teacher IDs are derived from the enrollment. Creation requires an
active student and course. Overlapping non-cancelled lessons for either the same
teacher or the same student return 409, including across different enrollments.
Back-to-back lessons are allowed. Legacy lessons without an end time block the
remainder of that date from their start time.

All lesson mutations take a PostgreSQL `SHARE ROW EXCLUSIVE` table lock before
reading availability, inside a `READ COMMITTED` transaction. Concurrent API
bookings therefore check availability after the previous mutation commits.
This deliberately serializes schedule writes across the school; revisit lock
granularity if scheduling volume grows. Direct database writers must use the
same availability-check protocol; conflict rejection is enforced by the API.

## Student lesson rescheduling

Students open **Lesson → lesson card → Manage lesson** to select an available time matching the original lesson duration and submit a request. A 60-minute lesson displays 60-minute choices; a 90-minute lesson displays 90-minute choices. Start times are offered every 30 minutes within free calendar ranges. Gaps exclude existing lessons and pending/approved trials for the teacher or student and must fit the entire lesson. No manual full-lesson availability publishing is needed.

Sayad's Baku working hours are Monday–Friday **10:00–11:00 and 15:00–23:30**, Saturday **12:30–23:30**, and no Sunday hours. Sultanbanu works Monday, Tuesday, Thursday and Friday **10:00–11:00 and 16:00–22:00**, Saturday **16:00–22:00**, and does not work Wednesday or Sunday. The student's selected lesson determines whose calendar is used. Availability refreshes automatically every 15 seconds, including previously loaded weeks. Newly signed-up students retain separate **15-minute trials with Sayad only**.

The existing lesson stays booked until approval. Each submitted request counts toward **three per Baku calendar month**, including rejected requests. Only one request per lesson may be pending. Pending requests do not reserve the proposed time; approval rechecks working hours, duration, teacher/student conflicts, and whether the original lesson changed.

Teachers and admins open **Lessons → Rescheduling requests** to approve or reject requests. Approval moves only the selected lesson, resets its reminder, and displays **Rescheduled** on its card. Notifications cover requests and outcomes.

Student cancellation has no monthly quota and closes pending requests for that lesson. Admins can restore future student-cancelled lessons if the time remains free, or exclude a mistaken rescheduling request from the monthly count with a recorded reason.

Run `bun run db:generate` and `bun run db:migrate` when deploying these changes. Validation: `bun test`, `bun run typecheck`, `bun run mobile:export`, and `bun scripts/test-rescheduling-ui.ts` (isolated browser fixtures).

