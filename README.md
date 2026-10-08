# PRC Region III eHRIS

**Professional Regulation Commission Region III — Electronic Human Resource Information System**
*Digitalizing Personnel Records, HR Services, and Workforce Management*

An internal personnel platform for a Philippine government regional office:
employee master records, digital PDS, service records, private versioned
documents, time & attendance with correction requests, leave, HR service
requests with a visible approval timeline, configurable workflows, reports,
data import, a data-quality dashboard and an immutable audit trail. It is **not
a public site**: there is no public employee search and no employee data is
reachable without signing in.

> Inspired by the general idea of government HRIS platforms; no third-party
> branding, schema or workflow was copied. This is an independent internal
> system and not the official PRC website.

**Honest status.** The MVP is functional and heavily tested (see
[Testing](#testing)), but it has not been deployed to a hosted Supabase
project, and several things are interfaces only (email/SMS, biometric, payroll,
SSO, AI). Defaults for roles, workflows, leave and document rules are **editable
starting points that the agency must validate**, and the system is **not
claimed to be compliant** with RA 10173 — see `docs/security.md` §9.

## Contents

* [Features](#features) · [Roles](#roles) · [Architecture](#architecture)
* [Setup](#setup) · [Environment variables](#environment-variables) · [Database](#database-setup) · [Authentication](#authentication)
* [Demo environment](#demo-environment-and-credentials)
* [Testing](#testing) · [Deployment](#deployment) · [Security](#security-considerations)
* [Known limitations](#known-limitations) · [Roadmap](#roadmap) · [Project layout](#project-layout)

## Features

| Area | What works |
|---|---|
| **Employee master record** | Identity, government employment info, sensitive identifiers (TIN/GSIS/PhilHealth/Pag-IBIG) in a separate restricted table, addresses, supervisor, plantilla; HR create/edit **with mandatory reason**; field-level **change history** |
| **Organization** | Regional office → division → section → unit → service center as **data** (admins edit it without code); positions, plantilla items, employment statuses, natures of appointment |
| **Digital PDS** | Normalized sections (family, education, eligibility, work, voluntary, learning & development, other info, references, IDs, declaration), employee certification, HR verification/return, print and PDF summary |
| **Service record** | Chronological history, non-overlapping periods enforced by the database, derived current record, mismatch detection |
| **Documents** | Private storage, categories, per-document versions with reason/uploader/checksum, HR verification, soft delete, **every view/download audited**, files streamed through the app (no public URLs), content-verified uploads |
| **Time & attendance** | Monthly DTR, team view, status badges, holidays, **attendance-correction requests** (employee → supervisor → HR; applying the correction to the DTR) |
| **Leave** | Balances (beginning/earned/used/pending/available), filing, supervisor → HR approval, configurable balance rules, HR balance maintenance. **No legal entitlement is inferred** |
| **HR requests** | COE, COE with compensation, service record, certification, document copy, PDS/personal-info/employment-info corrections, other; **request numbers `HR-2026-000123`**, priority, assignment, attachments, **timeline UI**, released-document handoff |
| **Workflow engine** | Configurable steps (supervisor or permission-based), statuses, notifications, supervisor stand-in rule; one engine for leave, attendance and HR requests |
| **Dashboards** | Employee (completion %, today's attendance, balances, pending, quick actions), HR (workforce, attendance, pending actions, distributions), Management (aggregate only) |
| **Search** | Permission-aware: employees only ever find themselves; supervisors their team; HR everyone |
| **Reports** | 11 reports with filters/date ranges, on-screen and **Excel / PDF / CSV** export (exports are audited; formula-injection safe) |
| **Import** | CSV/XLSX → detect columns → map → validate (duplicates, dates, formats, references) → preview → confirm → create; error report; nothing invalid is imported silently |
| **Data quality** | 16 live checks: incomplete, duplicate, inconsistent, missing/expired documents |
| **Administration** | Users (invite), roles & permissions, organization, positions, plantilla, lookups, leave types, request types, document categories, workflows, holidays, settings |
| **Audit** | Immutable log of sign-ins, changes (before/after/reason), views, downloads, approvals, admin actions; filterable viewer and CSV export; identifiers masked |
| **Privacy** | Privacy notice + versioned acknowledgement, least privilege, no technical errors shown to users |
| **Notifications** | In-app (live). Email/SMS: outbox + channel interface, **not connected to any provider** |
| **Demo mode** | `DEMO_MODE=true` shows a visible **DEMO ENVIRONMENT** banner; fictional seed data only |

Interfaces only (clearly labelled in *Administration → Integrations / AI*):
email & SMS delivery, biometric attendance, payroll systems, agency SSO,
document management system, GSIS/CSC, and the optional AI assistants.

## Roles

`SUPER_ADMIN`, `HR_ADMIN`, `HR_STAFF`, `SUPERVISOR` (head of office), `EXECUTIVE`
(Regional Director dashboard), `EMPLOYEE`, `AUDITOR` (read-only). A user may
hold several (a supervisor is also an employee). Roles are data: administrators
create more and change permissions in the UI. The default matrix is in
`docs/security.md`.

## Architecture

Next.js 16 (App Router, React 19, TypeScript, Tailwind v4) + Supabase
(PostgreSQL with Row Level Security, Auth, private Storage). The browser never
talks to Supabase; the server runs every query **as the signed-in user**, and the
database enforces permissions regardless of what the UI shows. Business rules
(workflow transitions, balances, versioning, audit) live in SQL so they hold for
every caller.

Read: [`docs/architecture.md`](docs/architecture.md) ·
[`docs/database-schema.md`](docs/database-schema.md) ·
[`docs/security.md`](docs/security.md) · [`docs/workflows.md`](docs/workflows.md) ·
[`docs/deployment.md`](docs/deployment.md) · [`docs/roadmap.md`](docs/roadmap.md)

## Setup

Requirements: Node 22+, npm, a Supabase project (hosted, or local via the
Supabase CLI + Docker), `psql` for loading SQL.

```bash
git clone <repo> && cd ehris-prc
npm ci
cp .env.example .env.local        # fill in the values (see below)
```

1. **Database** — apply `supabase/migrations/*.sql` in order (see below).
2. **First administrator** — invite a user in Supabase → Authentication, then
   `psql "$DATABASE_URL" -1 -v admin_email="'you@agency.example'" -v admin_name="'Your Name'" -f supabase/bootstrap_admin.sql`.
3. **Run** — `npm run dev` → <http://localhost:3000>. Production: `npm run build && npm start`.

Local Supabase (optional): `supabase start` (uses `supabase/config.toml`), then
`supabase db reset` applies the migrations. Take `SUPABASE_URL`/`SUPABASE_ANON_KEY`
from `supabase status`.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | yes | Used only on the server |
| `SUPABASE_SERVICE_ROLE_KEY` | for user invitations, notification job | Secret; bypasses RLS |
| `APP_URL` | yes | e.g. `http://localhost:3000` |
| `SESSION_IDLE_MINUTES` / `SESSION_MAX_HOURS` | no (30 / 12) | Session timeouts |
| `DEMO_MODE` | no (`false`) | `true` shows the DEMO banner and demo account hints |
| `DEMO_PASSWORD` | demo only | Used by `npm run demo:users`; ≥ 12 characters |
| `CRON_SECRET` | notification job | Bearer secret for `/api/jobs/notifications` |

Never commit `.env*` (only `.env.example` is tracked).

## Database setup

* Migrations are numbered and ordered; apply with `supabase db push` / the SQL
  editor. `0010_reference_data.sql` seeds permissions, roles, lookups, default
  workflows and settings — **review it** (editable defaults, not policy).
* Types for the app are generated from a migrated database:
  `DATABASE_URL=postgresql://… npm run db:types`.
* Row Level Security is enabled on every table; table privileges for `anon` and
  `authenticated` are revoked and re-granted narrowly (see `0009`).

## Authentication

Supabase Auth email + password. Accounts are **invited** (public sign-up is off);
`profiles` links a login to an employee record and an active flag — a login
without an active profile can do nothing. Password reset by email link. First
sign-in requires acknowledging the privacy notice. Sessions: HttpOnly cookies,
idle timeout, absolute lifetime, sign-in rate limiting. MFA and SSO are
Supabase Auth settings (not an in-app screen). There is no demo-only
authentication path: demo accounts are real Auth users with fictional identities.

## Demo environment and credentials

Use a **separate** project/database. Everything is fictional and labelled:
employee numbers are `DEMO-0001…`, emails use the reserved `.example` domain.

```bash
# .env.local → DEMO_MODE=true, DEMO_PASSWORD=<12+ chars>, SUPABASE_SERVICE_ROLE_KEY=…
npm run demo:users                                    # creates the 8 demo logins
psql "$DATABASE_URL" -f supabase/demo/demo_data.sql   # loads fictional organization & records
```

Password for every demo account = the `DEMO_PASSWORD` you set (nothing is
hard-coded for hosted use).

| Account | Role |
|---|---|
| `juan.delacruz@demo.prc3.example` | Employee (has a missing time-out to correct) |
| `analiza.bautista@demo.prc3.example` | Employee (use to try accessing Juan's records) |
| `lorna.dizon@demo.prc3.example` | Supervisor — Licensure & Registration Division |
| `paolo.mercado@demo.prc3.example` | HR Staff |
| `teresita.navarro@demo.prc3.example` | HR Admin (also heads the Finance & Administrative Division) |
| `ricardo.villanueva@demo.prc3.example` | Regional Director (executive + supervisor) |
| `eduardo.pascual@demo.prc3.example` | Auditor (read-only) |
| `admin@demo.prc3.example` | Super Administrator |

Three data-quality problems are planted on purpose (missing government IDs,
assumed-duty-before-appointment, no service record). **Try the acceptance
scenario:** Juan → Time & Attendance → *Request correction* → submit → Lorna
approves in *For My Action* → Paolo finalizes → Juan sees *Approved · DTR
updated* → the auditor finds every step in *Audit Logs* → Ana cannot open any of
Juan's records.

## Testing

```bash
npm run check        # lint + typecheck + unit tests + database tests
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # Vitest unit tests (import validation, notification worker)
npm run test:db      # throwaway PostgreSQL 16: migrations + demo data + 5 SQL suites
```

* **`test:db`** (needs PostgreSQL 16 server binaries; `supabase/tests/run.sh`)
  loads a stub of Supabase's `auth`/`storage` schemas and default privileges,
  applies every migration, loads the demo data, then impersonates each role the
  way PostgREST does and checks RBAC/RLS, IDOR, privilege escalation, workflow,
  documents/storage policies, audit immutability and the complete acceptance
  scenario with its audit trail.
* **`e2e/`** (browser, test-only) — `bash e2e/run-all.sh` builds the app, starts
  PostgreSQL → **PostgREST** → a small auth/storage gateway → Next.js, and runs
  three Chromium suites: the acceptance walkthrough (46 checks), a tour of 96
  screens across all roles (server errors, access denial, mobile overflow), and
  transactional/security flows (69 checks incl. direct REST/storage attacks).
  Needs a [PostgREST](https://postgrest.org) binary (`POSTGREST_BIN`) and
  `playwright-core` with a Chromium (`/opt/pw-browsers/chromium` by default).
  The gateway **replaces Supabase Auth/Storage for testing only** — never deploy it.

Results at the time of writing: lint clean, strict TypeScript clean, 9 unit
tests, all SQL suites, 46 + 96 + 69 browser checks passing.

## Deployment

See [`docs/deployment.md`](docs/deployment.md): Supabase project setup (auth
hardening, SMTP, MFA, backups), environment, hosting notes, scheduler for the
notification job, first-run and hosted-verification checklists.

## Security considerations

Row Level Security on every table; server-side authorization for every
sensitive action; private file storage with content-verified uploads; immutable
audit and version history; IDOR-safe (unauthorized rows appear as "not found");
nonce-based CSP and security headers; CSRF-safe actions; rate-limited sign-in;
generic errors with log references; no secrets in the repo or the browser.
Details, the role matrix, residual risks and the agency-validation checklist:
[`docs/security.md`](docs/security.md).

## Known limitations

* Not yet exercised on a hosted Supabase project (verification steps in `docs/deployment.md`).
* Email/SMS, biometric, payroll, SSO, DMS, GSIS/CSC and AI are **interfaces only**.
* No in-app MFA enrollment, antivirus scanning or multi-instance rate limiter.
* PDS fields/declaration wording must be reconciled with the current CSC form;
  the generated PDF is an electronic summary, not the official form.
* No leave accrual, no late/undertime computation (needs agency rules), no
  cancellation of an already-approved leave.
* Default roles, workflows, leave and document rules are unvalidated starting points.

## Roadmap

`docs/roadmap.md` — delivered scope, interfaces awaiting specifications, and a
suggested path to production (validate defaults → hosted verification → pilot
import → email → biometric → rollout → AI, with human-in-the-loop guardrails).

## Project layout

```
src/app/(auth)        sign-in, reset, privacy
src/app/(app)         signed-in screens + server actions (one folder per module)
src/components        ui primitives, module components
src/lib/auth          session, permissions, rate limit
src/lib/data          typed read queries (data-access layer)
src/lib/validation    zod schemas      src/lib/import  import parsing/validation
src/lib/reports       report definitions, xlsx/pdf/csv  src/lib/pds  PDS config + PDF
src/lib/services|integrations|ai   abstractions (notifications, future systems, AI)
src/proxy.ts          CSP nonce, session refresh, timeouts, route gate
supabase/migrations   schema, RLS, workflow engine, audit, reference data
supabase/tests        SQL test suites + harness     supabase/demo   fictional seed data
e2e/                  browser suites + test-only local stack
docs/                 architecture, schema, security, workflows, deployment, roadmap
```

Engineering conventions: simplest solution that works; fail fast with clear
errors; one responsibility per module; the type system (generated DB types,
strict TS) before runtime checks; small, evidence-based changes.
