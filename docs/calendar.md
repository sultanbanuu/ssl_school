# Lesson calendar

The web staff Lessons screen provides a Monday–Sunday calendar. Admins and
managers create lessons; teachers create lessons for their assigned enrollments
and edit or delete their own lessons. Students see
read-only lesson cards on web and native, with course, teacher, date/time, and
status. Cards refresh every 15 seconds while active, on returning to the screen,
and on manual refresh; they use the same scoped lesson records edited by staff.
Cancelled lessons remain visible to students with their status. Native iOS/Android staff retains the list editor, with multi-day and
all-day dates preserved. The drag calendar and repeat editor are web features.

## Using the calendar

- Navigate with Today and previous/next week, and filter by student, teacher or course.
- Scroll sideways through earlier and later weeks without a fixed week boundary.
  The top scrollbar is hidden. Drag a day header sideways, swipe, use the bottom
  calendar scrollbar, or hold Shift with the mouse wheel. Arrow keys work when
  the calendar is focused. The calendar keeps a three-week window in memory and
  loads/recenters it as you scroll; the time labels stay pinned on the left.
- Drag an empty calendar time range or use Schedule a lesson. Keyboard users can use
  the schedule button and focus a card, then press Enter to open its editor.
- Drag a card between days/times in 15-minute steps. Drag its bottom edge to
  resize. The editor offers the same actions with explicit dates and times.
- The calendar shows 10:00–23:30. The Duration editor and drag gestures use
  these bounds, with start/end sliders in 15-minute steps. All-day end dates remain
  inclusive. Existing records outside these hours remain stored.
- Student, teacher and course selectors load every page of the directory, including
  people/courses without lessons. Choose a student and available course; existing
  enrollments are reused. Create enrollment explicitly when needed, then save the
  lesson. Enrollment uses the course teacher; the lesson teacher can be overridden.
  Inactive students remain listed but cannot be selected for a new enrollment.
- The Student dropdown contains all registered students and a live name/surname
  search inside it. Clear the search to show everyone. Arrow keys and Enter select
  a result; Escape closes the dropdown without closing the lesson editor.
  There is no separate assigned-enrollment selector. Both staff and teachers choose
  the student once, then select a course and enroll or schedule from the same form.
  Teachers can enroll students only in their own active courses. Their scheduling
  directory exposes names and status only; student records remain access-scoped.
- Choose a lesson color or Automatic (course). Saving a color change updates every accessible occurrence in the current series,
  including completed/cancelled lessons, regardless of the schedule-edit scope.
  Calendar cards show the student’s full name first, followed by course and time.
- Select a teacher in the editor. The enrollment teacher is the initial default;
  admins/managers can assign a different teacher to a lesson or future occurrences.
  This does not change the student's enrollment teacher. Student cards and reminders
  use the lesson's selected teacher. Teachers can access only lessons assigned to
  them and cannot reassign lessons to another teacher.
- Set an optional reminder, daily repetition, or weekly selected weekdays and
  an end date. Series are bounded to one year and at most 366 occurrences.
- Editing a repeating lesson offers This lesson or This and future lessons.
  Future edits preserve the spacing between already booked occurrences. To
  change the repeat pattern, cancel future lessons and create a new series.
- Clear resets the draft timing to 10:00–11:00, switches off all-day/reminders,
  and removes repetition on new lessons. It does not delete a saved lesson.
- Right-click a lesson to edit, mark completed, cancel or delete it. Status checkboxes have been removed; all statuses remain visible.
- Completed and cancelled lessons are read-only. Cancelled lessons are hidden
  unless Show cancelled is selected. Simultaneous lessons use separate lanes.
- Delete lesson asks whether to delete just this occurrence (the default) or all
  lessons in its recurring series. All includes earlier, future, completed and
  cancelled occurrences within the user’s permissions. Deletion removes them from
  staff calendars and student cards. If any selected lesson has progress records,
  the entire operation is rejected and nothing is deleted.
- Teachers can drag empty time ranges to schedule, drag cards to reschedule, and
  drag card edges to resize. Touch gestures inside the timed grid select a range;
  day headers and scrollbars remain available for navigation.
- Cancel and Mark completed ask for confirmation before changing data. Choose just
  the selected lesson or all scheduled lessons in its recurring series, including
  earlier and future dates. Terminal records stay unchanged.
- Completion also lists earlier unfinished lessons in the same student/course
  enrollment. Choose to skip those lessons or complete them too. Only lessons
  that have already ended and end no later than the selected lesson's start are
  eligible; future/ongoing, cancelled, completed, unrelated, and inaccessible
  lessons are excluded. The server rechecks eligibility in the write transaction.

## Storage and conflict rules

Dates and times are school civil time (Asia/Baku), independent of device timezone.
Existing date/start_time/end_time fields remain compatible. end_date adds
overnight/multi-day support; all-day rows use an exclusive midnight in storage.
Each actual occurrence is a lesson row linked by series_id, with its repeat_rule
recording the original creation pattern. Future reschedules split off a series.

Booking and rescheduling check both teacher and student overlap across date
boundaries. Adjacent endpoints are allowed. Cancellation releases a time slot.
Series creation and future edits are atomic, including rollback on conflicts.
A shared database lock serializes schedule changes across API processes.

## Reminders

The API process checks every 30 seconds. A reminder creates an in-app notification
for the enrolled student and assigned teacher, even while their calendar is
closed. The API must be running; this is not OS push, email, or SMS delivery.
All-day reminders use midnight Baku time. Delivery and the sent marker commit
together under the schedule lock, preventing duplicate delivery across workers.
Cancelled lessons are skipped. On restart, overdue reminders are delivered only
if the lesson has not ended. Rescheduling resets that occurrence's reminder.

## Deployment

Apply the included additive migration before starting the updated API:

```sh
bun run db:generate
bun run db:migrate
bun run start
```

`20261023000100_lesson_calendar` backfills existing end dates, adds scheduling
fields/indexes, and replaces the same-day time constraint with a multi-day one.
`20261023000200_lesson_color` adds a nullable color with a hex-value constraint.
The migrations have been tested in disposable PostgreSQL-compatible PGlite; it is
not automatically applied to the database configured in .env.

## Verification

```sh
bun run typecheck
bun test
bun run mobile:export
bun run test:calendar:ui
bun run test:notifications:ui
```

Browser tests use isolated API fixtures and headless Edge (override
BROWSER_CHANNEL if needed); they do not modify school data. Calendar screenshots
are written to dist/calendar-qa/. Backend tests exercise conflict handling,
recurrence rollback, editing scope, all-day boundaries, and reminder delivery.
