# SSL School mobile app

The Expo 58 app combines student signup/sign-in, session restoration, lesson
scheduling, payments, and notifications. Install and run from the repository
root. There is one package.json, package-lock.json, and app.json for the project.

```sh
npm ci
bun run db:generate
bun run mobile:web -- --port 8081
# Native preview:
bun run mobile:start
```

Set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_CURRENCY` (default AZN) in the root
`.env` or `.env.local`. The old `mobile/.env.local` is no longer read by Expo.
Use a reachable LAN API address on a physical phone. Keep database credentials,
auth secrets, and R2 keys server-side, without an EXPO_PUBLIC_ prefix.

Run the API separately (`bun run dev`) with reviewed migrations applied.
Add `sslschool://` and the web origin (for example `http://localhost:8081`) to
`TRUSTED_ORIGINS`. Native development builds must be rebuilt for Expo 58.
All screens share one Better Auth cookie store: web requests use browser cookies
and native requests attach the stored cookie.

Students can sign up publicly. Teacher and manager roles require admin promotion.
All roles have lesson schedules and notifications; only students and admins have
payment access. Staff schedule lessons and send announcements. Students submit
receipts; admins approve or cancel payments. Uploads require the private R2
configuration and bucket CORS in [payment setup](../docs/payments.md).

Receipt images accept JPEG, PNG, or WebP up to 5 MiB. Failed payment submissions
retry the same upload ID while that screen remains open. Check payment history
before restarting an interrupted submission. Receipt viewing links remain in
memory and are cleared after expiry or backgrounding.

```sh
bun run typecheck
bun test
bun run mobile:export
bun run test:notifications:ui
```

Browser tests use isolated HTTP fixtures. Native SecureStore, image selection,
device back navigation, and the deployed API/R2 flow still need device testing.
