# Analytics / Performance

The existing Expo mobile navigation now exposes performance to staff and to students directly on Profile, with all analytics sections and period controls below the student identity. Profile also opens Settings → Account settings or Billing & subscriptions.

- Admins and managers select an existing enrolled student and assign an internal A1–C2 level badge. This uses `performance_level`, independently of the existing profile English level. Student performance responses omit this badge.
- Teachers browse their courses and enrolled students, assess scheduled/completed lessons, and adjust existing assessments. There is one evaluation per lesson, saved immediately without draft/publish states.
- Teacher weights default to Speaking 35%, Vocabulary 25%, Listening 20%, Sentence structure 20%. They must total 100%. Each evaluation stores its weight snapshot; changing defaults does not rescore historical evaluations.
- Speaking has four criteria scored 0–5. Other categories have adjustable earned/possible points. Blank scores are unassessed; zero is an explicit assessment. Overall scores remain incomplete while a positive-weight category is missing. Homework is separate.
- Students see week/month performance, comparisons, a progress chart, skill breakdown, feedback, and next targets. Periods use the school timezone (Asia/Baku), with Monday-start weeks. Overall performance averages complete lessons; skill averages exclude unassessed values. Chart points represent daily means. Students with no evaluations see clearly labelled preview scores (95–100), a sample chart, and an invitation to explore courses. Preview values are never stored or mixed with actual evaluations.

## Database rollout

Apply `20261103000100_performance` before running this API version against an existing database:

```sh
bun run db:migrate
bun run db:generate
```

The migration adds internal student levels, teacher weight preferences, and the row-level-security-enabled `lesson_evaluations` table. Application authorization scopes students to themselves, teachers to their assignments, and evaluation writes to the assigned teacher. No existing progress records are modified or silently converted into rubric evaluations.

## Validation

```sh
bun run typecheck
bun test tests/performance.test.ts tests/database.test.ts
bun run mobile:export
bun run test:performance:ui
```

Browser tests use isolated API fixtures at 390px, exercise admin assignment, teacher weight validation, editing saved scores with the original weights, and student period/scoring controls. They also capture mobile and desktop screenshots under the ignored Expo export directory. Native device behavior and a deployed database/API need their normal release smoke checks.

Signup now requires an international phone number. Students can edit their own number in Account settings; the API updates the auth user and school profile together. Apply `20261103000200_signup_phone` before using this version.
