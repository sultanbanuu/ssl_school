# Monthly payments and private R2 receipts

Students manually pay outside the app, upload a receipt, and submit it for review.
There is no automatic charge, bank verification, or recurring billing job.
Only active students can pay for their active enrolled courses. The backend copies
the course's fixed monthly price and name when creating the upload intent; that
quote is valid for 15 minutes. Clients cannot supply an amount or another student ID.

Admins alone can approve/cancel payments and see all payment history. Managers and
teachers cannot access payments or receipts. Students can read their own payments
from the last six calendar months; older records remain stored. Student and admin
screens should refetch history after submission/review (or on focus); no realtime
notification service is included.

## API flow

All endpoints require the existing session authentication.

1. `GET /api/payments/courses` lists the student's eligible courses and
   `monthlyPrice` decimal string. Supports `limit` and `offset`.
2. `POST /api/payments/uploads` with
   `{ "courseId": "uuid", "contentType": "image/png", "size": 12345 }` creates
   an upload intent and returns `uploadId`, `uploadUrl`, required upload headers,
   quoted `amount`, `courseName`, and `submitBefore`.
3. PUT the raw image bytes directly to `uploadUrl` with the returned Content-Type.
   Do not send the API session cookie to R2. The signed URL lasts 5 minutes.
   JPEG, PNG, and WebP are accepted, up to 5 MiB. SVG and PDF are not supported.
4. `POST /api/payments` with `{ "uploadId": "uuid" }` verifies ownership, expiry,
   enrollment, file size, content type, and basic image signature. It reads the
   bounded image into server memory and writes a separate private final R2 object.
   The database stores object keys/metadata only, never image bytes. The final key
   cannot be changed using the staging upload URL. The payment becomes `pending`.
   Retrying the same upload ID returns the existing payment, including after review.
5. `GET /api/payments?status=pending` supplies the admin review queue.
   `status` is optional; `limit` defaults to 25 (maximum 100), `offset` defaults to 0.
   Returned student IDs can be resolved using the existing student detail endpoint.
   `GET /api/payments/:id` returns the current saved status and detail. Pending
   payments show `availableActions: ["approve", "cancel"]` to admins, and no
   decision actions to students. Viewing either endpoint never changes status.
6. `GET /api/payments/:id/receipt` checks admin/owner access and returns a viewing
   URL valid for 5 minutes. These URLs are bearer links: do not persist or log them.
7. Admin sends `PATCH /api/payments/:id/review`:
   - Approve: `{ "status": "approved", "startDate": "2026-10-19" }`.
   - Cancel: `{ "status": "cancelled" }`. An optional `cancellationReason` may be supplied.
8. Refetch history to display the saved status, dates, and cancellation reason. A cancelled
   payment remains in history; the student starts a new upload to try again.

Approval requires a start date on every payment. Each period is one calendar month,
with an **exclusive** end date: October 19 covers up to, but not including, November
19. Month ends clamp: January 31 -> February 28 (29 in leap years). These are calendar
dates, not timestamps; submission/review timestamps are stored as UTC instants and
should be displayed in the user's local timezone. Overlapping approved periods for
the same student/course return 409. Approval records dates; it does not create lessons
or change student-wide start dates. Approved/cancelled payments cannot be re-reviewed.
Approval and cancellation both persist `reviewedBy` and `reviewedAt` in PostgreSQL.
Payment detail/history responses are marked `private, no-store` to avoid cached
status results. A frontend should refetch after the admin's decision and when the
student opens or refreshes history. No realtime UI transport is included yet.

One pending payment per student/course is enforced by a database unique index.
Reviews use enrollment row locks and a conditional status update to prevent conflicting
decisions. Upload intents are limited to 10 per student per hour. Signed PUT links can
be reused until expiry; final receipts are isolated from them. Size/signature validation
occurs at submission, not while the bytes are uploaded to R2. This is basic format
validation, not a full image decoder or malware scanner.

## R2 setup

1. Create a **private** bucket. Leave public r2.dev access and public custom domains
   disabled. Create a bucket-scoped Object Read & Write API token.
2. Set all four server environment variables from `.env.example`:
   `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
   Credentials must never be placed in Expo/public frontend configuration.
3. For browser clients, configure bucket CORS using the actual frontend origins:

   ```json
   [{
     "AllowedOrigins": ["http://localhost:8081"],
     "AllowedMethods": ["PUT", "GET", "HEAD"],
     "AllowedHeaders": ["Content-Type"],
     "ExposeHeaders": ["ETag"],
     "MaxAgeSeconds": 300
   }]
   ```

   Replace/add the production HTTPS frontend origin. API CORS settings do not
   configure R2 CORS. Native mobile clients do not enforce browser CORS.
4. Add an R2 lifecycle rule deleting objects under **`staging/` after one day**.
   Do not apply this rule to `receipts/`; six-month UI history is not a deletion policy.
   Failed submissions attempt to delete unused final objects. For crash recovery,
   periodically reconcile unreferenced `receipts/` objects after a suitable grace
   period against database keys; never delete referenced receipts.
5. Generate the client and deploy migrations to the intended application database:
   `bun run db:generate`, then `bun run db:migrate`. Start the API normally.

Without R2 configuration the rest of the API still works; storage-dependent payment
operations return 503. Partially supplied R2 configuration fails startup validation.

Before deployment, verify the complete PUT -> submit -> admin review -> private GET
flow against the actual R2 bucket and PostgreSQL database. Automated tests use an
injected storage boundary and disposable PostgreSQL; they do not access live R2.

## Migration and legacy records

The migration converts the old Boolean status to `pending`/`approved` and preserves
the old `reciept_url` column as a nullable legacy reference. New uploads use
`receipt_key`. Existing dates/reviewer information are unknown and remain NULL;
legacy records are visible to admins but cannot be reviewed with the new endpoint.
They need manual reconciliation before joining the new monthly flow. Legacy receipt
URLs are never returned or fetched automatically. Existing lesson-status changes
are preserved.

The manual-decision migration renames the historical `rejected` status to
`cancelled`, preserving its reason and reviewer. Existing approved payments stay
approved; inspection does not undo an earlier explicit decision. Use a new payment
to test the pending flow. Review request payloads now use `cancelled` and optional
`cancellationReason` rather than the old rejected/rejectionReason names.

## Development checks

Run `bun test` and `bun run typecheck` for the backend, and `npm run typecheck`
inside `mobile/` for the Expo app. The automated tests in `tests/` cover the API,
authentication, people management, payment rules, and database constraints using
isolated test dependencies; they do not create live payment records.

For a manual check, use the Expo app with your existing local student/admin accounts:
select a course, attach a receipt, submit it, then review it as admin and refresh the
student's history. See [mobile setup](../mobile/README.md). Existing local test-account
credentials remain in the ignored `.env.payment-test.json`; keep that file private.
The one-off setup/live-test scripts and generated Postman collections were removed.
