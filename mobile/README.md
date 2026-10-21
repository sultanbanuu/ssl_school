# SSL School payment app

Expo SDK 55 app for iOS, Android, and web. Uses the existing API and Better Auth
accounts. Includes sign-in, student history and receipt submission, payment detail,
and admin approval/cancellation. Managers and teachers see an access explanation.

## Run

```sh
cd mobile
npm ci
```

Copy `.env.example` to `.env.local`. Set `EXPO_PUBLIC_API_URL` to your running API's
address. For a physical phone, use your computer's LAN IP, not localhost; Android
emulators commonly use `http://10.0.2.2:3000`. Set `EXPO_PUBLIC_CURRENCY` to the
school's actual currency (default AZN). This is a display setting because payment
responses currently contain amounts without currency metadata.

Add `ssl-school://` to the backend's comma-separated `TRUSTED_ORIGINS`. For Expo Go
development also configure the exact Expo development origin as described by Better
Auth's Expo integration. For web add `http://localhost:8081` to trusted origins and
R2 bucket CORS. Use the same hostname for the local web app and API so browser
session cookies work; production cross-site cookie hosting needs separate planning.
Use HTTPS in production. Never copy database or R2 credentials into this app.

```sh
npm start
# or
npm run web
```

The API must already be running, with migrations applied and R2 configured for
uploads. Sign in with a provisioned account; there is no public signup.

## Behavior and validation

- History has status filters, pagination, pull-to-refresh, and refresh on app resume.
- Students select an eligible course and attach JPEG, PNG, or WebP up to 5 MiB.
- Uploads send raw bytes to the signed URL without the API session cookie.
- A failed submission retries the same upload ID to recover a lost response without
  creating another payment. Restarting the screen loses that in-memory retry state;
  check history before creating a fresh upload.
- Receipt viewing links stay in memory and are cleared after expiry/backgrounding.
- Admins explicitly confirm decisions; approval requires a real calendar date.
  The API enforces enrollment, permissions, duplicate payments, and period overlap.
- Historical payments without receipts have no review controls.

```sh
npm run typecheck
npx expo install --check
npx expo export --platform web
```

Device smoke test: sign in as student, submit a real receipt, inspect pending detail;
sign in as admin, inspect receipt, approve with a start date; sign in as student and
refresh history. Repeat with cancellation, invalid/oversize images, network failure
after upload, and a teacher/manager account. This creates real payment records but
does not move money. Automated builds do not replace this API/R2/device check.
