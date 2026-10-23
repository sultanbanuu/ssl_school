# In-app notifications

Every signed-in role has a private inbox in the mobile app's Notifications tab.
Users can switch between all and unread notifications, refresh, load older items,
mark one notification read, or mark all read. The inbox refreshes when opened or
when the app returns to the foreground. An unread count appears in the inbox.
The Notifications navigation button also has a red unread badge (capped visually
at `99+`). While signed in, the app checks for updates every 15 seconds and on
foreground entry, pausing checks in the background. Outside the inbox, the latest
unread update appears in a dismissible floating banner. Tapping it opens the inbox;
dismissing it does not mark it read. A message is shown at most once per signed-in
app session. The badge synchronizes after inbox refreshes and read actions.

The inbox shows compact message previews; opening a message displays its full text
on a detail screen with an explicit mark-read action. Empty, loading, and retry
states are included. All and unread filters remain available during read updates;
the completed request refreshes the current filter rather than an outdated view.

Admins and managers can open a dedicated composer, select an account, and send a
title and message. A confirmation screen offers a return to the inbox or another
update. The inbox refreshes after sending, including announcements sent to oneself.
The composer includes character counts and prevents dismissal while sending.
Recipients are paginated and expose only names, roles, and profile IDs.
The composer also offers **All students**. Admins and managers can send the same
announcement to every profile with the student role, including inactive students
who still have a student account. Staff profiles are excluded. The success screen
reports the number delivered; an empty student audience returns a validation error.
Titles allow 1–160 characters and messages 1–5000 characters after trimming.
Announcements use the existing Notification model, so no migration is needed.

| Method | Route                                              | Behavior                                                                                    |
| ------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| GET    | `/api/notifications?limit=25&offset=0&unread=true` | Own inbox; omit unread for all                                                              |
| GET    | `/api/notifications/unread-count`                  | Own unread `{ count }`                                                                      |
| PATCH  | `/api/notifications/:id/read`                      | Mark own notification read; repeat calls succeed                                            |
| PATCH  | `/api/notifications/read-all`                      | Mark own unread items read; returns `{ updated }`                                           |
| GET    | `/api/notifications/recipients`                    | Admin/manager paginated account selection                                                   |
| POST   | `/api/notifications`                               | Admin/manager sends `{ userId, title, message }`                                            |
| POST   | `/api/notifications`                               | Broadcast `{ audience: "all_students", title, message }`; returns `{ audience, delivered }` |

`userId` is the recipient's profile ID, not a student or teacher record ID.
Even administrators can only read and mark their own inbox. A foreign or missing
notification returns 404. Clients cannot set type, read status, or creation time.
Read endpoints disable caching. Sending creates an `announcement` notification.

This version delivers in-app announcements. Device push, email delivery, scheduled
reminders, and automatic payment/lesson event notifications are not implemented.
API tests cover authentication, role restrictions, ownership filters, pagination,
validation, and marking read.

`scripts/test-notification-ui.ts` runs thirteen browser regression scenarios against the
exported app with isolated API fixtures. It covers all four roles, message details,
read/all-read actions, switching filters during an in-flight read, pagination,
inbox/recipient/read/send failures and recovery, composer validation, a self-sent
announcement, dismissal prevention during sending, and a 320px long-message view.
It also captures mobile and desktop screenshots and checks for browser exceptions.
Additional scenarios verify floating arrival banners, dismissal, badge read-state
synchronization, the `99+` display, and broadcasting without selecting one account.
No real accounts or notifications are changed by these tests.

To run, export from `mobile` with
`npx expo export --platform web --output-dir dist-notification-review`, then run
`bun run test:notifications:ui` from the repository root. Playwright is a pinned
development dependency installed with the other project dependencies.
The browser defaults to installed Microsoft Edge; set `BROWSER_CHANNEL=chrome`
to use installed Chrome. Screenshots are written to the ignored
`mobile/dist-notification-review/qa` directory.

Native-device and live authenticated database smoke tests remain manual: send an
announcement as staff, sign in as the recipient, refresh the inbox, mark it read,
and confirm the unread filter/count update. Browser fixtures do not validate
native keyboard behavior, device back navigation, or a deployed authentication
and database connection.
