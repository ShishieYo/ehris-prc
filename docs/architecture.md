# Architecture — PRC Region III eHRIS

This document describes how the system is built and why. It was written as the
architecture proposal before implementation and has been kept in line with what
was actually built. Where something is only an interface or a placeholder, it
says so.

## 1. Repository inspection and decisions

The repository was **empty** (no framework, database, authentication, CI or
components), so there was no existing architecture to preserve. The stack was
chosen to follow the brief's preferred direction:

| Concern | Choice | Why |
|---|---|---|
| Application | Next.js 16 (App Router), React 19, TypeScript (strict) | Server components keep personal data on the server; server actions give one validated write path |
| Styling | Tailwind CSS v4 + a small in-repo component set | No UI library dependency; accessible by construction |
| Database | PostgreSQL (Supabase) | Row Level Security, transactions, constraints, SQL functions |
| Auth | Supabase Auth (email + password; MFA/SSO configurable) | Real authentication provider, replaceable by agency SSO |
| Files | Supabase Storage, **private** bucket | No public URLs; access decided by SQL policies |
| Validation | Zod (server-side) + database constraints | Two independent layers |
| Hosting | Any Node 22 host (Vercel, container) + managed Supabase | See `deployment.md` |

Package manager: npm. Deliberately **not** used: Cache Components / caching of
any per-user data (nothing containing personal data is cached or shared between
requests), a charting library (bars/donut are plain SVG/CSS), a UI kit.

## 2. System architecture

```
 Browser ──HTTPS──▶ Next.js server (App Router)
                      │  proxy.ts: CSP nonce, session refresh, idle timeout, route gate
                      │  Server Components / Server Actions / Route Handlers
                      │      └─ data-access layer (src/lib/auth, src/lib/data)
                      │            runs every query AS THE SIGNED-IN USER (their JWT)
                      ▼
                 Supabase  ├─ Auth (sessions, password reset, MFA)
                           ├─ PostgREST (RLS enforced as the user)
                           ├─ PostgreSQL: tables + RLS + SQL functions + triggers
                           └─ Storage: private bucket + storage RLS
```

Key properties:

* **The browser never talks to Supabase.** All calls are server-to-server, so
  the browser holds only an HttpOnly session cookie. CSP `connect-src` is
  `'self'`.
* **The database is the authority.** Screens hide what you cannot do, but
  every sensitive operation is authorized again in PostgreSQL (RLS policies and
  `SECURITY DEFINER` functions that check permissions themselves).
* **Master / transaction / audit data are separate** (see §5).

## 3. Frontend architecture

* `src/app/(auth)` — sign-in, password reset, privacy notice (public layout).
* `src/app/(app)` — the signed-in area; its layout resolves the session, enforces
  the privacy acknowledgement and renders the sidebar/header.
* `src/components/ui` — design-system primitives (Button, Card, Table, Timeline,
  charts, form fields). Forms use `ActionForm`, which wires a server action,
  shows friendly errors, and **restores what the user typed** when validation
  fails (React otherwise resets uncontrolled fields).
* Dynamic data tables are responsive (scroll inside their own region), every
  control has a label, icons are decorative (`aria-hidden`), a skip link is
  provided, and `prefers-reduced-motion` is honoured.
* Download/export links are plain anchors, never `<Link>`: prefetching would
  trigger the file route (and its audit record) without a user action.

## 4. Backend architecture

There is no separate API server. Responsibilities are split like this:

| Layer | Location | Responsibility |
|---|---|---|
| Session / permissions | `src/lib/auth/session.ts` | One call per request: verified user + roles + permissions (`my_access()`); UI uses it only to decide what to show |
| Data access | `src/lib/data/*` | All read queries, typed (`src/lib/db/database.types.ts`) |
| Validation | `src/lib/validation/*`, `src/lib/pds/sections.ts` | Zod schemas; blank form fields → null |
| Writes | `src/app/**/actions.ts` | Server actions: `requireActionCtx()` → validate → call the database → friendly error |
| Business rules | `supabase/migrations/*` | Workflow engine, balances, document versioning, audit, validation — in SQL so they hold no matter who calls |
| Errors | `src/lib/errors.ts` | Database messages marked `hint='user'` are shown; everything else is logged with a reference and replaced by a generic message |
| Abstractions | `src/lib/services`, `src/lib/integrations`, `src/lib/ai` | Notification channels, future integrations, AI — interfaces only |

Server actions are POST-only with Origin checking built in (CSRF) and are always
re-authenticated; route handlers (`/documents/[id]/file`, exports) authenticate
themselves.

## 5. Database architecture

Three kinds of data, kept apart on purpose:

| Kind | Examples | Rules |
|---|---|---|
| **Master data** | employees, positions, plantilla, org units, lookups, leave types | Edited by HR/admins; changes are audited |
| **Transaction data** | leave applications, attendance corrections, HR requests, documents, imports | Created by users; state changes only through workflow functions |
| **Audit data** | `audit_logs`, `workflow_actions` | Append-only; immutable even to administrators |

See `database-schema.md` for the full model. Highlights:

* Sensitive personal fields live in `employee_private` (separate RLS), not in
  `employees`.
* Organizational structure is data (`org_units` with parent and type), not code.
* Approval routes are data (`workflows`, `workflow_steps`), not code.
* Business invariants are constraints: non-overlapping service periods
  (exclusion constraint), unique government identifiers, one active incumbent
  per plantilla item, one open correction per employee/date/type.

## 6. Authentication model

* Supabase Auth, email + password. Accounts are **invited by an administrator**
  (public sign-up is disabled in `supabase/config.toml`); the invited user sets
  their own password. There is no hard-coded or demo-only authentication path.
* `profiles` links an auth identity to an employee record and an active flag.
  A signed-in identity **without an active profile has no access to anything**.
* Session cookies are HttpOnly. `src/proxy.ts` refreshes the session, applies an
  **idle timeout** (default 30 min) and an **absolute lifetime** (default 12 h)
  and redirects signed-out visitors. A client-side idle guard also signs out
  unattended screens.
* Sign-in is rate limited per IP + email (in-memory; see `security.md` for
  multi-instance guidance); responses never reveal whether an email exists.
* First sign-in requires acknowledging the privacy notice (versioned; bump
  `privacy.notice_version` to require re-acknowledgement).
* The system is ready to be connected to an agency identity provider (OIDC/SAML)
  through Supabase Auth without application changes; MFA (TOTP) is a Supabase
  Auth setting (see `deployment.md`). **Not implemented:** an in-app MFA
  enrollment screen.

## 7. Authorization / RBAC model

Permission-based. Roles are named sets of permissions (`roles`,
`role_permissions`, `user_roles`); the catalogue is in `permissions`.
Administrators can create roles without code changes, but can only grant
permissions they hold themselves, cannot edit their own roles, and the last
active Super Administrator cannot be removed.

Relationship-based access is layered on top:

* **self** — `current_employee_id()` from the signed-in profile
* **supervision** — `supervises(employee)`: direct supervisor, or head of the
  employee's unit or any ancestor unit, **and** holds `team.view`

The default role matrix is in `security.md`. Every table has RLS enabled;
tables with no policy for a role are inaccessible to it. Table privileges for
`anon`/`authenticated` are revoked broadly and granted narrowly, and internal
functions are not executable by end users.

## 8. Audit logging

* Row changes on master and transaction tables are captured by a generic trigger
  (`audit_row_change`): who, when, module, old/new values (changed columns only)
  and the **reason** where one was supplied.
* Reads and exports a trigger cannot see (document view/download, PDS view,
  sign-in/out, report export) go through `log_event()`, which accepts only an
  allow-list of actions and refuses document events the caller cannot read.
  Downloads and exports are logged **before** any bytes are returned.
* Government identifiers, addresses and PDS declaration answers are **masked**
  in the trail (field names kept, values replaced).
* Immutability: no INSERT/UPDATE/DELETE privilege for users; triggers block
  UPDATE, DELETE and TRUNCATE for everyone (including the table owner).
* IP/device metadata is recorded **only if** the agency enables
  `audit.capture_network_metadata` after the Data Protection Officer confirms the
  legal basis (default off).

## 9. Document storage

* Private bucket `personnel-documents`; there are **no public or signed URLs**.
  Files are streamed through `/documents/[id]/file` after the database confirms
  the caller may read the version row; responses are `no-store`.
* Object keys are `{employee_id}/{random-uuid}.{ext}`. Storage RLS: upload only
  into your own folder (or any folder with `document.write`); read only objects
  that belong to a registered version you may read; **no update/delete policies**
  — files are immutable.
* Uploads are validated server-side: size limit, allow-listed type **verified
  against the file's actual bytes** (a renamed executable is rejected), SHA-256
  recorded. Registration (`create_document`, `add_document_version`) re-checks
  limits and that the object really exists under the right employee's folder.
* Versioning: replacing a file adds a version (reason required, same file
  rejected); versions are immutable. Deleting is a soft delete with a reason;
  physical purge is a records-retention decision and is not automated.

## 10. Workflow engine

One engine drives leave, attendance corrections and HR requests; see
`workflows.md`. Transitions happen only inside `wf_submit`, `wf_act` and related
`SECURITY DEFINER` functions; a trigger prevents clients from writing status,
step, request number or workflow columns directly.

## 11. Notification architecture

* **In-app**: written by the database (`notify()`) at each workflow event, to the
  people who must act and to the requester. Strictly personal (RLS).
* **Other channels** (`email`, `sms`) are configured in `system_settings`
  (`notifications.channels`); each enabled channel gets an `notification_outbox`
  row. `src/lib/services/notifications` defines the `NotificationChannel`
  interface and a worker (`processOutbox`) exposed at
  `POST /api/jobs/notifications` (bearer `CRON_SECRET`).
* **No provider is wired in.** Email/SMS channels are `NotConfiguredChannel`s:
  rows stay pending and nothing pretends to be sent. To go live, implement the
  interface (SMTP, Microsoft Graph, SMS gateway) and register it.

## 12. Security controls (summary)

Least privilege (RLS + grants); server-side authorization everywhere; private
file storage with byte-level type checks; immutable audit; IDOR-safe lookups
(RLS returns "not found", not "forbidden"); Zod + DB constraints; parameterized
data access only (no string-built SQL; dynamic SQL in functions uses
`format('%I')` over whitelisted names); React escaping + nonce-based CSP, no
`dangerouslySetInnerHTML`; CSRF via Server Action Origin checks and same-site
cookies; rate limiting on sign-in/reset; generic errors with log references;
security headers (CSP, HSTS, nosniff, frame-ancestors none, referrer policy,
permissions policy); formula-injection-safe CSV/XLSX export. Details and
residual risks: `security.md`.

## 13. Deployment architecture

Stateless Next.js instances behind HTTPS + managed Supabase (Postgres, Auth,
Storage) + a scheduler calling the notification job. See `deployment.md`.

## 14. Backup strategy

* **Database**: Supabase daily backups, plus Point-in-Time Recovery for
  production (RPO minutes). Migrations in `supabase/migrations` rebuild the
  schema; reference data is in `0010_reference_data.sql`.
* **Files**: database backups do **not** include Storage objects. Schedule a
  separate bucket backup (e.g. `rclone`/S3 sync to agency-controlled storage).
* **Audit trail**: periodically export (Audit Logs → CSV) to write-once storage.
* **Restore drills**: restore into a scratch project at least quarterly and run
  `npm run test:db` against it.
* Retention periods for personnel records and audit logs are an agency records
  policy decision and are **not** assumed here.

## 15. Scalability

Sized for hundreds to low thousands of users. Notes for growth:

* Indexes exist on the policy-critical columns (`employees.org_unit_id`,
  `supervisor_employee_id`, audit time/subject/entity). RLS helper functions are
  `STABLE`; if profiling shows policy cost at scale, cache `my_access()` per
  request (already single-call) and add covering indexes.
* Lists are paginated server-side; reports cap on-screen rows and stream full
  data as downloads.
* `audit_logs` is append-only and grows steadily: partition by month when it
  exceeds tens of millions of rows; archive old partitions.
* The in-memory rate limiter is per instance; use a shared store when running
  several instances.
* Heavy exports/imports (≤ 5,000 rows, 5 MB) run in a request; move to a queue if
  limits are raised.
