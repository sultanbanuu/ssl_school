# School notifications

Only admins can compose and send announcements. Managers, teachers, and students cannot send or list recipients, including through direct API calls. Admins choose one student or All students; non-student recipients are rejected. Broadcasts include inactive profiles that still have the student role.

Students receive announcements in their private inbox and, after enabling notifications, on registered iOS/Android devices while the app is closed. Browser builds use the in-app inbox, badge, and floating banner. Existing automatic lesson/rescheduling inbox messages are unchanged.

Admin flow: Notifications → Send a school update → select student or All students → enter title/message → Send. Titles allow 1–160 characters and messages 1–5000 after trimming. Long messages are shortened in device previews; full text stays in the inbox. Confirmation means the message was saved and device delivery queued, not that a device displayed it.

Student flow: Notifications → Enable device notifications, then grant system permission. Tapping a push opens the inbox, including after a cold launch. Foreground entry refreshes registration when permission was already granted. Token rotation is handled. Signing out removes registration before ending the session; if removal fails, sign-out can be retried. Registering a shared device to another student deletes its previous queued messages. Push already accepted by the provider cannot be recalled.

## Native setup required

1. Run bun run db:generate and bun run db:migrate before deploying the API. The migration adds registrations and a persistent delivery queue. The API starts the worker automatically.
2. Link the app to your Expo EAS project. Set expo.extra.eas.projectId in app.json, or supply EXPO_PUBLIC_EAS_PROJECT_ID when building the native app. Use a real project UUID.
3. Configure Android FCM v1 credentials and the matching google-services.json file in the EAS/Expo project; configure the iOS APNs key and signing credentials. Do not commit private service-account/APNs keys.
4. Build and install a new native development or production app with the expo-notifications plugin. Expo Go and web exports do not provide this app's device push flow. Test on a physical device.
5. If enhanced Expo push security is enabled, set server-only EXPO_ACCESS_TOKEN on the API. Never use an EXPO_PUBLIC variable for that secret.

Follow [Expo's setup guide](https://docs.expo.dev/push-notifications/push-notifications-setup/) and [sending/receipt guide](https://docs.expo.dev/push-notifications/sending-notifications/).

The repository does not supply project-specific EAS IDs, FCM/APNs credentials, or signing credentials. Exporting JavaScript is not a signed native build and does not prove live device delivery.

## Delivery behavior

Inbox messages and device jobs commit in one transaction. The worker polls every 15 seconds, claims jobs with a two-minute lease, and checks Expo receipts after 15 minutes. Temporary failures use exponential backoff (up to eight attempts per stage); permanent failures become failed jobs. Invalid tokens are removed. Provider receipt success does not guarantee display. Delivery is at least once: a crash after provider acceptance but before saving its ticket can cause a duplicate push. Failed jobs remain in push_deliveries for operational inspection and do not remove inbox messages.

The worker sends only explicitly queued admin announcements and checks that devices still belong to student recipients. Database row-level security protects queue data and tokens; authenticated API endpoints enforce ownership. Keep the API running for delivery and receipt processing.

## API

| Method | Route | Access / behavior |
| --- | --- | --- |
| GET | /api/notifications | Own inbox, limit/offset and optional unread=true |
| GET | /api/notifications/unread-count | Own unread count |
| PATCH | /api/notifications/:id/read | Mark own message read |
| PATCH | /api/notifications/read-all | Mark own messages read |
| GET | /api/notifications/recipients | Admin only; paginated student profiles |
| POST | /api/notifications | Admin only; { userId, title, message } or { audience: "all_students", title, message } |
| POST | /api/notifications/devices | Student only; { token } registers current device |
| DELETE | /api/notifications/devices | Removes { token } only if owned by signed-in account |

A recipient userId is a profile ID. Read endpoints never expose another account's inbox. Clients cannot assign ownership when registering tokens or set announcement type/read status.

## Verification

Run bun test tests/notifications.test.ts tests/push-delivery.test.ts tests/database.test.ts and bun run typecheck. Tests cover roles, recipients, ownership, atomic queue writes, payload size, receipts, retries, invalid tokens, account changes, migration constraints, and deletion cascades.

For focused browser checks, first run bun run mobile:export, then set NOTIFICATION_UI_FILTER to cannot compose student|composer validation|recipient load failure|all-students broadcast and run bun run test:notifications:ui. The older full UI suite includes legacy navigation/filter expectations that need updating separately.

For live verification, install a configured native build on a phone, sign in as a student, enable notifications, close the app, and send from a separate admin session. Verify delivery, tap-to-inbox, full text, broadcast, and logout/account switching. Check receipts and denied permission separately.
