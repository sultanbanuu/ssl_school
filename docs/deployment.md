# Railway API deployment — Developer 1

Deploy the Bun API directly from GitHub using Railway's built-in Railpack builder.
No Docker installation or custom Dockerfile is required. Deployment still requires
your Railway project, PostgreSQL service, domain, and secrets.
The API is a continuously running service because it also runs reminder and delivery
workers. Start with one replica and leave service sleeping disabled.

## Prepare the database

Use a separate production database. From a trusted release checkout with network
access to that database, set the owner `DIRECT_URL` only in the release environment
or ignored `.env.migrations`. Run:

```sh
bun install --frozen-lockfile
bun run db:generate
bun run db:migrate
```

Provision `school_app` once following [database access](database-access.md), then
run `bun run db:permissions` after each migration. Set the release check's
`DATABASE_URL` to that restricted login and run `bun run db:check-access`.
Railway's database-owner URL must not be used as the API's `DATABASE_URL`.
Use the private database hostname from the API; an operator outside Railway needs
an accessible connection address for release commands.

Do not configure a migration pre-deploy command on the API service: its environment
must not contain owner credentials. Apply reviewed migrations and grants through
the separate release environment before deploying the API. Take a backup before
schema changes and rehearse restoration before the student pilot.

## Configure the API service

Connect the repository to a Railway service with the repository root as its build
directory. Configure these values in Railway service settings:

| Setting | Value |
| --- | --- |
| Builder | Railpack |
| Build command | `bunx --bun prisma generate` |
| Start command | `bun run start` |
| Healthcheck path | `/ready` |
| Healthcheck timeout | 120 seconds |
| Restart policy | On failure, up to 5 retries |
| Replicas | 1 |

Railpack detects the Bun project and installs dependencies. Client generation does
not need a database connection. Deploy from GitHub so ignored local environment
files and artifacts are not uploaded. Keep secrets in Railway variables.

Set server variables in Railway:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Restricted `school_app` connection to production PostgreSQL |
| `BETTER_AUTH_SECRET` | A new random secret of at least 32 characters |
| `BETTER_AUTH_URL` | Actual HTTPS API origin, such as `https://api.example.com` |
| `TRUSTED_ORIGINS` | Comma-separated actual web origins and approved native app scheme from `.env.example` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Private production receipt bucket configuration |
| `RECEIPT_CLEANUP_ENABLED` | Initially `false`; preview before enabling |

Railway supplies `PORT`. Do not add `DIRECT_URL` or copy `.env.migrations` into
the API service. Never put server secrets into Expo public variables.

## Domain and verification

Add the API custom domain in Railway. In Cloudflare DNS, enter the exact record
Railway provides; use DNS-only while verifying the domain and HTTPS certificate.
Update authentication URL/origins to the actual domains. Configure R2 CORS for the
web app's actual HTTPS origin using [payment setup](payments.md).

Railway checks `/ready` before routing the new deployment. `/health` is liveness;
`/ready` verifies database/auth access. Add separate ongoing uptime monitoring:
the deployment health check is not continuous monitoring.

Before inviting students, verify login/session restoration, role isolation,
receipt upload and private viewing, payment review, and notification inboxes.
Coordinate Expo's production API URL and account email links with Developer 2.
Device push testing remains a separate native-build check.

For cleanup, run `bun run receipts:cleanup` from the trusted checkout against
production first. Enable `RECEIPT_CLEANUP_ENABLED=true` only after reviewing its
counts and confirming the database/bucket pairing.

Rollback the API to the previous compatible image if needed. Database migrations
are not automatically reversed by an image rollback. Keep schema changes compatible
with the previous release where possible, and test backup restoration separately.

## Other services and ownership

Developer 1 manages Cloudflare DNS, Workers Static Assets for the exported Expo web
app, private R2 receipts, database backups/restoration, and server push delivery.
Developer 2 supplies the web build and handles Better Auth account flows with Resend,
Expo EAS Android builds, Firebase/FCM credentials, and Google Play release work.
Developer 1 applies the email DNS records and server secrets supplied by Developer 2.
GitHub and GitHub Actions remain the shared source-control and validation tools.

References: [Railway build/start settings](https://docs.railway.com/builds/build-and-start-commands),
[Railpack builds](https://docs.railway.com/builds/railpack),
[Railway health checks](https://docs.railway.com/deployments/healthchecks).
