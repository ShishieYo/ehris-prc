# Deployment

Target: stateless Next.js (Node 22) behind HTTPS + a managed Supabase project +
a scheduler for the notification job. Any host that runs Node works (Vercel, a
container platform, a VM). Choose a hosting region and a Supabase region that
satisfy the agency's data-location requirements (see `security.md` §9).

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
