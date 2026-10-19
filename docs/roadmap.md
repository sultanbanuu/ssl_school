# Four-week implementation roadmap — two developers

## Week 1 — foundations and core school records
Developer A: isolated PostgreSQL, Prisma schema/migrations, Better Auth, provisioning,
role permissions, credential recovery. Developer B: API foundation, courses, enrollments,
student/staff management, API contracts. Both: authorization tests and a minimal Expo
login smoke test. This commit begins this milestone; email and management UI are pending.

## Week 2 — school workflows
Developer A: indexes, transactions, private files, access tests, migration rehearsal.
Developer B: scheduling, progress, payment records, notifications, dashboard summaries.
Complete acceptance tests for each workflow. Confirm grading scale, lesson timezone,
duration units, manager permissions, and student device distribution early.

## Week 3 — Expo frontend
Both developers build role-based navigation, reusable lists/forms, session restoration,
student course/schedule/progress/payment views, staff management, and teacher workflows.
Use the Better Auth Expo client with SecureStore and the configured app scheme.
Finish on-device integration by day 15.

## Week 4 — testing and private release
Days 16–17: end-to-end journeys, authorization, poor-network behavior, regression fixes.
Day 18: HTTPS API hosting, backups/restore rehearsal, signed builds, release instructions.
Day 19: small invited student pilot. Day 20: fix blockers and distribute privately.
Android uses a signed APK. Native iOS distribution requires a separately chosen Apple
distribution path; ad hoc provisioning has device/account requirements. Browser delivery
is an alternative. No public app-store publication is planned.
