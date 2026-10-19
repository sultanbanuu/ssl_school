# Draft-to-code decisions

Reference: Supabase project `ssl school`, inspected read-only on 2026-10-16.

The draft's 11 table names are retained: profiles, students, teachers, manager,
admin, courses, enrollments, lessons, progress_records, payments, notifications.
Camel-case application fields map to the existing snake-case SQL names.

Intentional changes:

1. Better Auth owns auth_users, auth_sessions, auth_accounts, auth_verifications.
   Profile IDs reference Better Auth UUID user IDs. Supabase auth triggers and
   `auth.uid()` policies are not copied into the independent database.
2. Foreign-key fields no longer generate random UUIDs. API/operator code must
   supply valid related records. Entity IDs still receive application UUID defaults.
3. Role tables have unique profile IDs. The operator provisioning transaction creates
   the matching role record. Role changes have no API yet; future changes must update
   role records atomically and validate existing teaching/enrollment relationships.
4. Enrollment uniqueness is enforced by (student_id, course_id). This represents
   one enrollment per student/course, matching the draft trigger. Repeat terms would
   require an explicit cohort/term model and a revised uniqueness key.
5. Added payment-to-course and notification-to-profile foreign keys.
6. Money uses Decimal(12,2), never floating-point arithmetic in the API. Existing
   unrestricted numeric values would require conversion checks before any data import.
7. Lesson status is a PostgreSQL enum. Date/time fields retain the draft shape;
   the school timezone and overnight lesson policy need confirmation before scheduling.
   The initial time constraint assumes lessons finish later on the same day.
8. Progress scores use Decimal(5,2); no 0–100 range is assumed. Confirm the grading
   scale before implementing progress input. No uniqueness per lesson is assumed.
9. `receiptUrl` maps to the draft spelling `reciept_url`. Future uploads should store
   private object keys or controlled URLs, never permanent public receipt links.
10. All tables enable RLS without anonymous policies. The trusted backend connection
    performs access checks; clients never receive PostgreSQL credentials or direct
    table access. Better Auth identity is not automatically propagated to SQL RLS.
11. Prisma maintains updated timestamps for Prisma writes. Draft timestamp/role/
    enrollment functions are replaced by application transactions and constraints,
    rather than preserved as callable public SECURITY DEFINER functions.
12. Admins and managers can manage courses/enrollments in this initial permission
    model. Students read active courses and their own enrollments. Teachers read their
    assigned courses/enrollments. This explicit manager policy is new, since the
    draft does not define a complete manager workflow.

The database does not yet enforce every cross-table teaching rule (for example,
lesson teacher versus enrollment teacher). Those invariants belong in the upcoming
scheduling service and its database checks. No migration imports existing user data.

Documentation checked through Context7: Prisma, Better Auth, and Elysia.
- https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators
- https://better-auth.com/docs/integrations/elysia
- https://better-auth.com/docs/integrations/expo
- https://elysiajs.com/essential/validation
