# Roadmap and status

## Delivered (MVP)

**Phase 1 — Foundation**: authentication (Supabase Auth), RBAC with
database-enforced policies, employee master record (sensitive data separated),
configurable organizational structure, employee/HR/management dashboards, audit
logging, private versioned document management.

**Phase 2 — HR transactions**: normalized digital PDS (+ certification,
verification, PDF summary), service record, time & attendance with DTR,
attendance correction workflow, leave (balances, workflow), HR service requests
with timeline and released-document handling, configurable workflow engine,
in-app notifications.

**Phase 3 — Management**: reports (11) with filters and Excel/PDF/CSV export,
data-quality dashboard, CSV/XLSX import wizard with staging, validation, error
report and confirmation, executive dashboard, administration (users, roles,
organization, positions, plantilla, lookups, workflows, settings), audit viewer
and export.

**Phase 4 — Intelligence**: **design only** — see below.

## Interfaces without an implementation (by design)

These exist so production work can plug in without redesign. None is active, and
the Administration pages say so.

| Item | What exists | What is needed |
|---|---|---|
| Email / SMS notifications | Outbox + worker + `NotificationChannel` interface; channels registered as "not configured" | SMTP/Graph/SMS credentials and a channel implementation |
| Biometric attendance | `AttendanceSource` interface; `attendance_records.source = 'biometric'` | Terminal vendor specification, ID mapping |
| Payroll / personnel systems | `PayrollSync` interface | API/file specification, system-of-record decisions |
| Agency SSO (PRC / Microsoft 365 / Google) | Auth is a pluggable Supabase provider; the app only trusts Supabase sessions | OIDC/SAML metadata |
| Document management system | `DocumentStore` interface | DMS API specification |
| AI data-quality assistant, HR assistant, document extraction | `AiProvider` interface and guardrails (`src/lib/ai/provider.ts`) | Agency decision on provider, DPO review, approved knowledge base. AI will only *suggest*; humans decide |

## Known limitations

* Real Supabase hosting was not available during development. The database layer
  and the whole application were tested against real PostgreSQL + PostgREST with a
  thin test-only auth/storage gateway (`e2e/`). Repeat the checks on the hosted
  project before go-live (`deployment.md`).
* No in-app MFA enrollment, antivirus scanning, shared (multi-instance) rate limiter.
* PDS fields and declaration wording must be reconciled with the current CSC form.
* Attendance import from files and late/undertime computation (needs the agency's
  work schedule rules) are not implemented.
* Leave: no accrual, no cancellation of an already-approved leave (HR corrects the
  balance), a leave spanning two calendar years deducts from the starting year.
* Reports are limited on screen to 500 rows; exports contain everything (≤ 10,000 rows for audit).
* Edit-in-place for PDS rows is by form; there is no bulk editing.
* Single-language (English) UI; Philippine time (Asia/Manila) is fixed.

## Next steps (suggested order)

1. Validate defaults with HR, the DPO and the Regional Director (role matrix,
   workflows, leave and document rules, privacy notice, retention).
2. Stand up the hosted Supabase project, run the migrations, repeat the security
   tests there, configure SMTP, MFA and backups.
3. Load real data through the import wizard in a staging project; use the Data
   Quality dashboard to clean it before production.
4. Wire the email channel; add biometric import.
5. Pilot with one division, then roll out by division.
6. Evaluate AI assistance only after the above, with the guardrails in
   `src/lib/ai/provider.ts`.
