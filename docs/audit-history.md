# Audit history

Admins can open **Audit history** in the app's navigation. The read-only list
shows the affected record, actor profile ID and role, event time, and operation.
Filter by payment, role, lesson, availability, trial, or reschedule; open a row
to compare changed fields. Refresh and load older changes are supported, with
empty/error/retry states. Other roles cannot access the screen or its API.

## Recorded changes

| Area | Recorded operations |
| --- | --- |
| Payments | Creation/submission, amount and status changes, approval/cancellation, subscription dates, reviewer and cancellation reason, deletion |
| Roles | Initial assignment, promotion/change, profile deletion; unrelated profile edits are ignored |
| Lessons | Creation, time/teacher changes, recurring-series changes, status, cancellation/restoration, reminder preference, deletion |
| Availability | Creation, time/course/teacher changes, active state, deletion |
| Trials | Booking, approval/rejection/cancellation and deletion |
| Rescheduling | Requests, decisions and review notes, quota waivers and reasons, deletion |

Audit starts when the migration is applied. There is no reconstruction or backfill
of earlier events. A repeated write with identical audited values adds no event.
Reminder-worker housekeeping (such as reminder_sent_at) does not add events.
Bulk changes produce one event per changed row, linked by transactionId.

## Integrity and attribution

PostgreSQL AFTER triggers insert audit events in the same transaction as the
business change. Rollback removes both; an audit insert failure aborts the change.
The backend sets the authenticated actor with transaction-local set_config, which
does not carry over to other requests using the pooled connection.

Admin/teacher/student actions in payment, role, lesson, availability and
rescheduling services supply actor context. Staff account creation supplies the
creator too. Public signup, operator commands, and direct database maintenance
have no authenticated app actor and are labeled **Database action**, with the
database login recorded. Actor IDs and roles are historical snapshots, not names
looked up from mutable profiles. Target and actor IDs have no foreign keys so
deleting accounts or lessons cannot erase their history.

The school_app/school_runtime roles can SELECT audit_logs but cannot INSERT,
UPDATE, DELETE, TRUNCATE, or disable its source triggers. A SECURITY DEFINER
trigger owned by the migration owner performs inserts with a fixed search path
and fully qualified table name. The trigger function is not publicly executable.
API startup also rejects direct runtime write privileges on audit_logs.

This protects against ordinary app edits/deletions, not a malicious database
owner or compromised backend that supplies false actor context. Database-owner
maintenance and retention must remain controlled operational tasks. No automated
audit deletion or retention period is introduced; agree a retention policy before
production. School integration tests leave their audit entries even after their
temporary application records are removed.

Snapshots use an explicit field allowlist. They exclude passwords, auth/session
tokens, emails, phone numbers, receipt keys/URLs and unrelated profile details.
Payment cancellation and rescheduling reasons are retained because they explain
the decision; staff should avoid putting unnecessary personal data in them.

## API and deployment

`GET /api/audit-logs` requires an authenticated admin and returns
`{ items, hasMore }` with `Cache-Control: private, no-store`.
Optional filters: entityType, entityId (UUID), actorId (UUID), and action
(created/updated/deleted). Pagination uses limit (1–100, default 25) and offset
(0–100000). Results are ordered by createdAt descending, then id descending.
There are no audit write/delete endpoints.

Deploy in order: `bun run db:generate`, `bun run db:migrate`,
`bun run db:permissions`, `bun run db:check-access`, then restart the API.
Use the migration owner for migrations/permissions, and school_app for runtime.
Do not add audit_logs to the generic CRUD table-grant list.

## Checks

- `bun test tests/audit.test.ts tests/database-access.test.ts`: real PostgreSQL
  trigger behavior through PGlite, actor isolation, transactional rollback,
  sensitive-field exclusions, append-only permissions, and API authorization.
- `bun scripts/check-admin-flow.ts`: opt-in local PostgreSQL smoke test, including
  an actual admin promotion and verification of its audit actor and snapshots.
- `bun run mobile:export` then `bun run test:audit:ui`: browser fixtures for admin
  navigation, details, filters, pagination, empty/error/retry states, and hiding
  history from other roles. Screenshots go to the ignored export directory.
