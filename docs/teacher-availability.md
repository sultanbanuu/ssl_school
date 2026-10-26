# Updated trial calendar

The web calendar is shared by students, teachers and administrators and scrolls horizontally. Students with any enrollment see lesson cards instead. Unassigned students see Sayad's available trial appointments, derived from gaps in the regular lesson calendar. Sayad is matched by first name, case-insensitively, and must have an active course.

The grid shows Monday through Saturday, 10:00-11:00 and 16:00-23:30 in half-hour sections. Generated trials last 15 minutes and use deterministic varied quarter-hour starts so they never jump on refresh. Booking rechecks availability inside the schedule transaction. Teachers can edit and remove their own booked trials; administrators can manage all. Removing a reserved slot cancels its active requests. Existing inactive slots suppress regenerated openings at that time.

Double-click an empty cell to publish a trial. Select a slot to edit or request it. Week navigation is below the grid; the desktop month picker remains available.

The Teacher Availability tab is available in the shared app navigation, including iOS and Android. Native phones use stacked availability cards and wrapping controls; tablets use two columns. The web view uses an agenda on small screens and the weekly calendar on desktop. Add availability is available without double-clicking a calendar cell.

Teachers can delete their own slots; admins can delete any teacher's slot. The confirmation explains that held trials are cancelled. DELETE /api/availability/:id handles both saved UUIDs and generated auto IDs under the scheduling lock. It retains inactive records and trial history so deleted generated times do not reappear. No database migration is required.

Verification: `bun test tests/availability.test.ts`; export web to `dist/availability-review`, then run `bun scripts/test-availability-delete-ui.ts` for isolated phone/desktop and deletion-confirmation checks.

The appointment picker is now shared by native and web. Phones show a selectable week strip and rounded appointment buttons for the selected day; tapping the month heading expands the month calendar. Desktop shows the month and seven day columns together. Blue marks the selected date, pale blue marks dates with slots, and amber marks reserved trials. Month navigation loads the full 42-day calendar range. Tapping a time opens the existing request/edit workflow, including deletion for teachers and admins.
