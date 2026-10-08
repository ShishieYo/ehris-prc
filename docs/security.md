# Security and privacy

> **This system implements technical controls that support privacy and security.
> It is not, by itself, compliant with the Data Privacy Act of 2012 (RA 10173) or
> any other law or standard.** Compliance depends on agency decisions and
> processes (see §9) that must be validated by the Data Protection Officer and
> legal counsel.

## 1. Threat model (short)

| Threat | Main controls |
|---|---|
| Employee reads/changes another person's records (IDOR) | RLS on every table; ids in URLs are never trusted — unauthorized rows simply don't exist for the caller ("not found", not "forbidden"); no public employee search |
| Privilege escalation through the API | Direct writes to sensitive tables are not granted; business writes are `SECURITY DEFINER` functions that check permissions; admin functions block self-escalation and granting permissions you don't hold |
| Direct API access, bypassing the UI | Verified end-to-end: calls made with a real employee token and with no/anon/invalid token (§7) |
| File exfiltration | Private bucket; no public/signed URLs; streamed through the app after a database check; storage RLS; immutable objects |
| Malicious uploads | Server-side size + type allow-list **checked against file bytes**, SHA-256, random keys, `nosniff`, sandboxed image responses |
| XSS | React escaping everywhere, no `dangerouslySetInnerHTML`, nonce-based CSP (`script-src 'self' 'nonce-…' 'strict-dynamic'`), `object-src 'none'` |
| CSRF | Server Actions: POST only + Origin check; same-site cookies; route handlers that change nothing are GET-only |
| SQL injection | Only parameterized access (PostgREST/RPC); dynamic SQL inside functions uses `format('%I')` over whitelisted names; free-text filters escape LIKE wildcards |
| Account takeover / brute force | Supabase Auth; sign-in and reset rate limiting; generic errors (no account enumeration); idle + absolute session timeouts |
| Tampering with history | Immutable audit and workflow history (even superuser UPDATE/DELETE/TRUNCATE is blocked); immutable document versions |
| Insider abuse | Least-privilege roles, separation of duties (HR admins cannot read the audit log; auditors cannot modify), access to sensitive data and downloads is logged |
| Spreadsheet formula injection | CSV/XLSX exports neutralize cells beginning `= + - @` |
| Accidental disclosure of internals | Technical errors are logged server-side with a reference and replaced by a friendly message |

## 2. Default role matrix

`✔` = permission granted by default. Roles and permissions are editable data
(Administration → Roles). Self-service access (own record) needs no permission.

| Permission | Super Admin | HR Admin | HR Staff | Supervisor | Executive | Auditor |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| employee.read_all | ✔ | ✔ | ✔ | | | ✔ |
| employee.read_sensitive (IDs, DOB, address) | ✔ | ✔ | ✔ | | | |
| employee.write | ✔ | ✔ | ✔ | | | |
| employee.manage_status | ✔ | ✔ | | | | |
| team.view (own subtree) | ✔ | | | ✔ | | |
| pds.read_all / pds.write_any | ✔ | ✔ | ✔ | | | |
| pds.verify | ✔ | ✔ | | | | |
| service_record.read_all | ✔ | ✔ | ✔ | | | ✔ |
| service_record.write | ✔ | ✔ | | | | |
| document.read_all / write | ✔ | ✔ | ✔ | | | |
| document.verify / delete | ✔ | ✔ | | | | |
| attendance.read_all / write | ✔ | ✔ | ✔ | | | read only |
| leave.read_all / manage | ✔ | ✔ | ✔ | | | read only |
| request.read_all / process | ✔ | ✔ | ✔ | | | read only |
| request.approve | ✔ | ✔ | | | | |
| workflow.override (stand in for a missing supervisor) | ✔ | ✔ | | | | |
| workflow.configure | ✔ | | | | | |
| report.view / dq.read / dashboard.hr | ✔ | ✔ | ✔ | | | ✔ |
| import.run | ✔ | ✔ | | | | |
| org.manage | ✔ | ✔ | | | | |
| dashboard.executive | ✔ | | | | ✔ | |
| audit.read | ✔ | | | | | ✔ |
| admin.users / admin.roles / admin.config | ✔ | | | | | |

Design notes: supervisors **cannot** see salary history, PDS, identifiers or
documents of their team (only attendance, leave and the requests they must
decide); the executive dashboard returns aggregates only; auditors have no
access to personnel files or identifiers by default.

## 3. Authentication and session controls

* Supabase Auth; accounts by invitation only (sign-up disabled); no demo-only auth path.
* Password policy: ≥ 12 characters with upper-case, lower-case and a digit enforced
  on the reset form; configure the same in Supabase (`config.toml`: minimum length 12,
  `lower_upper_letters_digits`). **Also enable leaked-password protection and MFA
  (TOTP) in the Supabase dashboard** for production.
* Idle timeout (`SESSION_IDLE_MINUTES`, default 30) and absolute lifetime
  (`SESSION_MAX_HOURS`, default 12) are enforced by `src/proxy.ts`, and a client
  guard signs out unattended screens. Note these use app cookies; for
  server-side enforcement enable Supabase's session inactivity timeout /
  time-box (Pro plan).
* Rate limiting: 5 failed sign-ins per IP+email per 15 minutes; 5 reset
  requests per IP per hour. In-memory per instance — put a shared limiter in
  front for multi-instance deployments. Supabase Auth applies its own limits too.
* Sign-in, sign-out and password changes are audited.

## 4. Data protection by design

* Sensitive fields are structurally separate (`employee_private`) with their own policy.
* Government identifiers are masked in the UI for non-owners and in the audit
  trail; change history shows *that* a field changed, never the value.
* Documents are never overwritten; deletion is soft and reasoned.
* Notification content avoids sensitive details; no email/SMS is sent unless an
  administrator configures a provider.
* Privacy notice + acknowledgement on first sign-in (versioned).
  **The notice text is a template** (`src/content/privacy.ts`) and must be
  reviewed by the DPO.
* Data minimization in views: supervisors get names and attendance, not
  records; management dashboards are aggregate.
* Audit metadata (IP/user agent) is **off by default** and must be justified
  before it is switched on.

## 5. Secrets and configuration

* No secrets in the repository. `.env*` is git-ignored (`.env.example` is the template).
* The browser never receives the Supabase URL/keys (server-to-server only).
* `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and is used in exactly two places:
  user invitation (after the caller's `admin.users` permission is checked) and
  the notification job (protected by `CRON_SECRET`, compared in constant time).
* Rotate JWT secrets/keys per the hosting provider's guidance; prefer asymmetric
  JWT signing keys.

## 6. Security headers

`Content-Security-Policy` (per-request nonce), `Strict-Transport-Security`,
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy:
same-origin`, `Permissions-Policy` (camera/mic/geolocation/payment/usb off),
`Cross-Origin-Opener-Policy: same-origin`, `Cache-Control: private, no-store`
on all application responses. `style-src` allows `'unsafe-inline'` because the
charts use inline `style` attributes (scripts remain nonce-only).
Auth pages are forced dynamic so the nonce is applied (static HTML cannot carry one).

## 7. Security testing performed

All of the following ran against real PostgreSQL 16 with the production
migrations, and (for the browser suites) the real application in Chromium. See
the README for how to repeat them.

**Database (`npm run test:db`, 5 suites)** — impersonating each role exactly as
PostgREST does (JWT claims + `authenticated` role):

* anon cannot read any table or call helper RPCs; employees see only their own
  rows in employees/private data/PDS/service record/attendance (IDOR by id returns nothing);
* employee cannot update/insert employee rows, call HR functions, forge audit
  rows, call internal functions (`notify`, `next_number`, `wf_log`);
* supervisor sees exactly self + team, no salary/PDS/identifiers/documents of the team,
  attendance of the team only;
* HR staff cannot change status, run imports, delete documents, manage roles,
  read the audit log or write service records; a reason is mandatory for changes;
* HR admin can change status but cannot manage roles or read the audit log;
* auditor can read and report but cannot modify anything; cannot see identifiers or files;
* role manager cannot grant permissions they do not hold; super-admin role is not editable;
  no self role changes / self deactivation; deactivated accounts see nothing;
* workflow: clients cannot set status/step/request number, cannot skip steps,
  cannot approve their own request, strangers cannot see or comment, HR cannot
  bypass a supervisor who exists, rejection needs remarks, a finished/approved leave
  cannot be cancelled (found and fixed by these tests);
* documents: upload only to own folder, registration validates object/path/type/size,
  storage RLS blocks colleagues/supervisors/auditors, versions immutable (even for
  superusers), duplicate file detection, soft delete;
* audit: old/new/reason captured, identifiers masked, immutable (UPDATE/DELETE/TRUNCATE
  blocked even for superusers), allow-listed events, network metadata opt-in;
* the full Juan → Supervisor → HR scenario and its audit trail.

**Browser end-to-end (Chromium, `e2e/`)** — acceptance walkthrough (46 checks),
a tour of 96 screens across all roles (server errors, no-access pages,
mobile overflow), and a flows suite (69 checks) including: wrong password /
unknown account give the same message, rate limiting, password-reset
non-enumeration, open-redirect prevention, idle-session sign-out, sign-out,
security headers, a disguised non-PDF upload rejected, duplicate government IDs,
**direct REST/storage attacks with an employee token** (own rows only, forged
audit/requests/notify refused, no credentials / anon / tampered token refused,
colleague's files not retrievable, upload into a colleague's folder refused).

**Unit tests (`npm test`)** — import validation rules (duplicates, impossible
dates, formats) and the notification worker (an unconfigured channel never
pretends to send).

Issues the testing found and fixed during development are recorded in the git
history (e.g. cancellable approved leave, static pages missing the CSP nonce,
download links being prefetched, duplicate element ids, forms wiping input after
a validation error).

## 8. Known limitations and residual risks

* Employee search terms travel in the URL query string (`/personnel?q=…`), so they can appear in
  server/proxy access logs (the referrer policy is same-origin, so they do not leave the site). Restrict
  log access accordingly. Record identifiers in URLs are random UUIDs, never personal data.
* No antivirus/malware scanning of uploads (type and content-signature checks only).
* No in-app MFA enrollment screen (use Supabase Auth MFA / SSO).
* Rate limiter is in-memory (per instance).
* Failed sign-ins are not written to the audit log (Supabase Auth's own logs
  record them); successful sign-ins and sign-outs are.
* Audit network metadata comes from headers the application server sets; a user
  calling the data API directly could spoof their own IP header (their identity
  is still recorded correctly). Not a concern while that option is off.
* Orphaned storage objects can remain if registration fails after upload; a
  periodic cleanup with the service role should remove unregistered objects.
* Soft-deleted documents and all versions are retained; there is no automated purge.
* Real files and Supabase Storage/RLS interplay was verified against a faithful
  local reproduction of the storage policies, not a hosted Supabase project —
  repeat the document tests on the real project before go-live (see `deployment.md`).
* Password hashing, token signing and email delivery are Supabase's; their
  configuration must be reviewed on the production project.

## 9. Requirements that still need agency validation

Not provided by software and **not assumed** here:

1. Privacy Impact Assessment and a documented lawful basis / consent approach per data category.
2. Designation and contact of the Data Protection Officer (placeholder in the notice).
3. Records retention and disposal schedule (personnel records, documents, audit logs).
4. Data subject request procedure (access, correction, objection) — the HR request types support intake only.
5. Personal data breach management and notification procedure.
6. Outsourcing/processing agreements with the hosting and Supabase providers; data location (region) and any cross-border transfer analysis.
7. Registration/notification obligations and annual security review with the National Privacy Commission, where applicable.
8. Authorization rules for who may hold each role (the defaults are starting points).
9. Whether capturing IP/device metadata in the audit trail is justified.
10. Approved formats for government identifiers, the official PDS (CSC Form 212) revision, and the leave/attendance rules the agency applies.
11. Staff training and acceptable-use policy.
