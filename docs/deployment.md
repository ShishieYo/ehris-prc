# Deployment

Target: stateless Next.js (Node 22) behind HTTPS + a managed Supabase project +
a scheduler for the notification job. Any host that runs Node works (Vercel, a
container platform, a VM). Choose a hosting region and a Supabase region that
satisfy the agency's data-location requirements (see `security.md` §9).

Planned path: **testing and pilot on a hosted Supabase project** (§1–§7, fictional
data only), then **production on PRC's own server** with self-hosted Supabase
(§8). The application is identical in both; only the environment variables and
the operations change. Hosted free plans pause after inactivity and have no
backups, so do not put real personnel data on one.

## 1. Supabase project

1. Create a project (production and, separately, staging). Keep the database
   password and the service-role key in the host's secret store only.
2. Apply the migrations **in order**: `supabase link` + `supabase db push`, or
   run each file of `supabase/migrations/` in the SQL editor. `0010` seeds
   permissions, roles, lookups and default workflows — review it first; it
   contains editable defaults, not agency policy.
3. Create the first Super Administrator: invite the person in
   Authentication → Users, then run `supabase/bootstrap_admin.sql` (usage in the
   file). Everyone else is invited from the application.
4. **Authentication settings** (Dashboard → Authentication):
   * disable public sign-ups; disable anonymous sign-ins;
   * minimum password length 12 with upper/lower/digits; enable leaked-password protection;
   * enable TOTP MFA (and plan to require it for HR/admin roles);
   * set **Site URL** to the production URL and add `https://<host>/auth/callback`
     to the redirect allow-list (invitations and password resets return there);
   * configure **SMTP** (agency mail relay) and customise the invite/recovery
     templates — Supabase's built-in mailer is rate limited and not for production;
   * (paid plans) set session time-box and inactivity timeout to match
     `SESSION_MAX_HOURS` / `SESSION_IDLE_MINUTES`;
   * review JWT signing keys; prefer asymmetric signing keys.
5. **Storage**: the migration creates the private bucket `personnel-documents`
   (10 MB, PDF/JPEG/PNG) and its policies. Confirm the bucket is **not public**.
6. **Backups**: enable daily backups and Point-in-Time Recovery. Database backups
   do not include Storage objects — schedule a separate bucket backup.
7. (Optional) Enable `network restrictions` so the database accepts connections
   only from the hosting provider.

## 2. Application configuration

Environment variables (see `.env.example`):

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | yes | Server-side Supabase access (never sent to the browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | for invitations and the notification job | Bypasses RLS — server only, keep secret |
| `APP_URL` | yes | Public base URL (password-reset/invitation links) |
| `SESSION_IDLE_MINUTES` | no (30) | Idle sign-out |
| `SESSION_MAX_HOURS` | no (12) | Absolute session lifetime |
| `DEMO_MODE` | no (`false`) | **Keep false in production.** Shows the DEMO banner and demo account hints |
| `CRON_SECRET` | for the notification job | Bearer secret for `/api/jobs/notifications` (≥ 16 chars; use a long random value) |

Build and run:

```bash
npm ci
npm run build
npm start            # or deploy to your platform
```

If the app sits behind a reverse proxy or CDN, forward `X-Forwarded-For`
(client address, used for rate limiting) and `X-Forwarded-Host`/`Host` (Server
Actions compare it with the browser's `Origin`; add extra public hostnames to
`serverActions.allowedOrigins` if you serve the app on more than one). Do not
cache application responses at the CDN (they are `private, no-store`). If you
use Vercel, note its request-body limit (4.5 MB on serverless functions) is
smaller than the app's default 10 MB upload limit: either lower
`documents.max_size_mb` or self-host.

## 3. Notification job

Email/SMS delivery is not wired to any provider. Once a channel implementation
is registered (see `src/lib/services/notifications/channels.ts`) and
`notifications.channels` includes it, run a scheduler every few minutes:

```bash
curl -fsS -X POST https://<host>/api/jobs/notifications \
  -H "Authorization: Bearer $CRON_SECRET"
```

Until then, unconfigured channels leave outbox rows pending and nothing is sent.

## 4. First-run checklist

1. Sign in as the Super Administrator; **acknowledge the privacy notice** after
   the DPO has replaced the template text (`src/content/privacy.ts`).
2. Administration → Organization: create the regional structure, positions and plantilla.
3. Administration → Lookups / HR request types / Leave types / Document categories: adapt to agency rules.
4. Administration → Users: invite HR, supervisors, auditors; link each to their employee record.
5. Import the personnel masterlist (Data Import), then clear the Data Quality dashboard.
6. Confirm Administration → System settings: upload limits, `audit.capture_network_metadata` (leave off until justified).
7. Run the **hosted-project verification** below.

## 5. Verifying a hosted project

The automated suites ran on local PostgreSQL/PostgREST with a test-only gateway.
On the real project, at least:

* run `supabase/tests` against a **staging** database (`npm run test:db` creates
  its own throwaway PostgreSQL; to run the SQL suites against Supabase, apply the
  migrations to a scratch project and adapt the stub header);
* with two real employee accounts, confirm one cannot fetch the other's
  `employee_private` rows or files through the REST/Storage APIs (the
  "Direct API attacks" checks in `e2e/flows.mjs` section K show exactly what to try);
* confirm anon/unauthenticated requests are rejected;
* confirm the `personnel-documents` bucket is private and that uploading into
  another employee's folder is refused.

## 6. Demo environment

A separate, clearly labelled environment (never the production project):

```bash
# .env.local: DEMO_MODE=true, DEMO_PASSWORD=<12+ chars>, SUPABASE_SERVICE_ROLE_KEY=...
npm run demo:users                              # creates the fictional login accounts
psql "$DATABASE_URL" -f supabase/demo/demo_data.sql   # loads fictional people/records (DEMO- employee numbers)
```

`DEMO_MODE=true` shows **DEMO ENVIRONMENT** on every screen. The demo loader
refuses to run twice; the account script refuses to run unless `DEMO_MODE=true`.

## 7. Operations

* **Logs**: the application writes structured JSON error lines (with a reference
  shown to the user) to stdout; ship them to the agency's log platform.
* **Upgrades**: add new numbered migration files; never edit applied ones.
  Re-generate types with `npm run db:types` and run `npm run check`.
* **Restore drill**: quarterly (see `architecture.md` §14).
* **Retention**: define and automate per the agency's records schedule; the
  application never purges documents or audit records.

## 8. Self-hosting on the agency's server

> **Status: documented, not yet tested.** The application has been verified
> against local PostgreSQL/PostgREST and a test-only gateway, not against a
> self-hosted Supabase stack. Treat the first deployment as a rehearsal: complete
> §8.7 on a test server with fictional data before any real record is loaded.
> Commands follow Supabase's own self-hosting guide, which changes between
> releases; where this section and that guide disagree, the guide wins.

Reference: https://supabase.com/docs/guides/self-hosting/docker

### 8.1 What PRC IT takes over

Hosted Supabase does these for you; self-hosted means PRC IT does them:
patching (OS, Docker images, PostgreSQL), backups and restore drills, TLS
certificates, monitoring, mail relay, key rotation, capacity and availability.
Agree who owns each before go-live.

### 8.2 Server requirements (starting estimates, not measured)

| Item | Suggestion |
|---|---|
| OS | Linux with Docker Engine + Compose plugin |
| Size | 4 vCPU, 8–16 GB RAM, SSD; disk for the database plus all documents with growth room |
| Network | Public/intranet HTTPS (443) only; PostgreSQL and the Supabase service ports **not** exposed outside the host/private network |
| DNS + TLS | One hostname for the app (e.g. `ehris.example`) and one for the API gateway (e.g. `api.ehris.example`), valid certificates |
| Mail | An SMTP relay for invitations and password resets |
| Time | NTP-synchronised clock (audit timestamps depend on it) |

One host may run everything; for availability, put the database on its own
machine or add a standby.

### 8.3 Install the Supabase stack

```bash
git clone --depth 1 https://github.com/supabase/supabase
mkdir ehris-supabase && cp -r supabase/docker/* ehris-supabase/ && cp supabase/docker/.env.example ehris-supabase/.env
cd ehris-supabase
```

Edit `.env` — **replace every placeholder secret**; none of the example values is
safe:

* `POSTGRES_PASSWORD`, `JWT_SECRET` (≥ 32 random characters), `DASHBOARD_USERNAME`/`DASHBOARD_PASSWORD`;
* `ANON_KEY` and `SERVICE_ROLE_KEY`: JWTs signed with your `JWT_SECRET` (the guide
  shows how to generate them; the `role` claim must be `anon` / `service_role`);
* `SITE_URL` = the app URL; `API_EXTERNAL_URL` / `SUPABASE_PUBLIC_URL` = the API gateway URL;
* `ADDITIONAL_REDIRECT_URLS` = `https://<app-host>/auth/callback`;
* `ENABLE_EMAIL_SIGNUP=true` is required for email login but keep
  `DISABLE_SIGNUP=true` (invitation only); `ENABLE_ANONYMOUS_USERS=false`;
* `SMTP_*` = the agency relay; `GOTRUE_PASSWORD_MIN_LENGTH` equivalent / password rules as in §1.4 where the stack exposes them;
* storage: the default file backend stores objects in a Docker volume — put that
  volume on the large, backed-up disk (or configure the S3-compatible backend).

Then `docker compose pull && docker compose up -d` and check `docker compose ps`
until all services are healthy.

Put a reverse proxy (nginx, Caddy) in front: terminate TLS for both hostnames,
forward the API hostname to the Kong gateway (default port 8000) and the app
hostname to the Next.js server. Do **not** publish the Studio dashboard, Postgres
or other service ports to the internet; reach Studio through VPN/SSH tunnel only.

### 8.4 Apply the schema

Run the migrations in order from a machine that can reach the database (inside
the Compose network is simplest):

```bash
for f in supabase/migrations/*.sql; do
  docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f"
done
```

Create the first Super Administrator exactly as in §1.3 (invite via Studio →
Authentication, then run `supabase/bootstrap_admin.sql` the same way). Confirm the
`personnel-documents` bucket exists and is not public.

### 8.5 Run the application

Same variables as §2, pointing at the self-hosted stack:
`SUPABASE_URL=https://api.ehris.example`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` from §8.3, `APP_URL=https://ehris.example`.
Run `npm ci && npm run build` and keep `npm start` alive under systemd or a
container with automatic restart. Self-hosting avoids the Vercel upload-size
limit noted in §2. The notification job (§3) is a cron entry on the same host.

### 8.6 Backups, patching, monitoring

* **Database**: nightly `pg_dump` (custom format) plus WAL archiving if point-in-time
  recovery is required; encrypt and copy **off the server**.
  ```bash
  docker compose exec -T db pg_dump -U postgres -Fc postgres > ehris-$(date +%F).dump
  ```
* **Files**: the storage volume is *not* in the database dump — back it up separately (rsync/restic to agency storage).
* **Audit trail**: also export periodically (Audit Logs → CSV) to write-once storage.
* **Restore drill** at least quarterly into a scratch environment, then run the checks in §8.7.
* **Patching**: track Supabase release notes; pull new images in a test environment first; apply OS updates on a schedule.
* **Monitoring**: disk space (documents grow), container health, certificate expiry, failed-login spikes, application error lines (§7).
* **Secrets**: keep `.env` readable only by the service account, outside the repository; rotating `JWT_SECRET` invalidates all sessions and requires regenerating `ANON_KEY`/`SERVICE_ROLE_KEY`.

### 8.7 Acceptance on the self-hosted stack

Before real data, with fictional data (§6) on the test server:

1. Run all of §5 (cross-employee API and storage attacks, anon rejected, private bucket, folder isolation).
2. Run the acceptance scenario by hand: employee files leave → supervisor approves → HR processes → employee sees Approved → audit trail shows each step → another employee cannot open the first one's records or files.
3. Restore last night's backup into a scratch instance and sign in.
4. Confirm the database and Studio ports are unreachable from outside the server network.
5. Record the results; the DPO and agency IT sign off before go-live.
