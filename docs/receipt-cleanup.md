# Abandoned receipt uploads

The database tracks every new staging upload and every attempted final receipt copy
before storage is written. Existing upload intents are backfilled by migration.
Staging objects become eligible 24 hours after the upload intent expires; failed
final copies become eligible 24 hours after their cleanup job was created.

Cleanup locks the upload row shared with submission, checks payment references
again, and removes only tracked objects with the expected key format. Referenced
receipts are retained regardless of payment status, including cancelled payments
and legacy URL references. Submitted upload metadata remains for idempotent retries.
Abandoned upload metadata is removed only after all its cleanup jobs are finished.

Storage failures retain the queue entry and retry with exponential backoff from
15 minutes to 24 hours. Missing objects can safely be deleted again after a crash.
Logs contain aggregate counts, not signed URLs or receipt keys.

## Deploy and preview

1. Run `bun run db:generate`, `bun run db:migrate`, and `bun run db:permissions`.
2. Run `bun run receipts:cleanup` for a non-deleting preview of up to 100 due jobs.
3. Run `bun run receipts:cleanup --apply` to process one batch, or set
   `RECEIPT_CLEANUP_ENABLED=true` on the API server for a batch at startup and every
   15 minutes. Automatic cleanup defaults to disabled and requires R2 configuration.

The command uses the restricted runtime database connection. Migration and grants
use the separate owner connection. Preview performs no object deletion or database
mutation; `eligible` reports candidates that passed the safety checks.

Only objects tracked in this database are eligible. Historical untracked final
objects from before this feature require separate reconciliation; this worker never
lists or sweeps the entire bucket. Keep the database and bucket configuration paired.
An optional lifecycle rule scoped to `staging/` can provide additional cleanup.
Never apply an expiration rule to `receipts/`: the six-month student history window
is not a receipt retention policy.
