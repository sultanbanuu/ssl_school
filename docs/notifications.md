# School notifications

Automatic teacher inbox notifications for lessons include the student's first name and surname in the title, plus their full name, course, lesson date and full time range in Asia/Baku in the message. Rescheduling requests show the original and requested schedules; decisions include the confirmed or unchanged schedule and any review note. Cancellation and restoration messages include the affected schedule. Overnight and all-day lessons include their end date. These details apply to newly generated notifications; existing inbox messages retain their saved text.

Only admins can compose and send announcements. Managers, teachers, and students cannot send or list recipients, including through direct API calls. Admins choose one student or All students; non-student recipients are rejected. Broadcasts include inactive profiles that still have the student role.

Students receive announcements in their private inbox and, after enabling notifications, on registered iOS/Android devices or browsers while the app/tab is closed. Browser builds also show an inbox badge and a floating, dismissible banner that opens the inbox. Existing automatic lesson/rescheduling inbox messages are unchanged.

## Browser push and local testing

1. Run `bun scripts/setup-web-push.ts` once to generate server-only VAPID settings in `.env`, then restart the API. For production pass a real contact, e.g. `bun scripts/setup-web-push.ts mailto:admin@your-domain.com` on an unconfigured environment, and set all three `WEB_PUSH_*` variables on the API host. Keep the same keys across restarts. Never expose the private key in an `EXPO_PUBLIC_*` variable.
2. Run the API (`bun run dev`) and web app (`bun run mobile:web`). Open `http://localhost:8082`, sign in as a student, open Notifications, click **Enable browser notifications**, and grant permission. If blocked, change the browser's site permission and retry.
   The inbox enable prompt disappears once this browser is registered. Open **Profile → Settings → Browser notifications** for the on/off switch and **Send test desktop notification**. Switching off unregisters this browser and stays off across reloads; inbox messages remain available. The test checks browser/OS display and click-to-inbox without contacting the push provider; use the admin announcement in the next step to verify server delivery.
3. Send an announcement from a separate admin browser session. Verify the floating banner while viewing another student screen, and the operating-system notification with the student tab closed. Keep the API and browser running and allow notifications in OS settings. Delivery normally begins within 15 seconds.
4. Clicking a system notification opens the inbox for the matching signed-in student. Signing out unregisters that browser subscription. Expired subscriptions are removed; temporary failures use the existing queue retry policy.

No publication is required for desktop localhost testing. Other origins require HTTPS: a phone accessing `http://192.168.x.x` is not localhost and needs a trusted HTTPS development URL. iPhone/iPad web push requires installing the site to the Home Screen. Serve `public/school-push-sw.js` at `/school-push-sw.js` with a JavaScript content type (Expo copies it into the web export). Notifications depend on browser and OS settings; closing the entire browser may prevent delivery.

Browser subscriptions are stored as validated `web:` tokens in the existing device/queue tables, so this feature adds no database migration. Only approved browser push-provider endpoints are accepted. The existing student-only registration and admin-only announcement permissions apply. The public key is available to authenticated clients at `GET /api/notifications/push-config`.

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
