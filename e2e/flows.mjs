// Transactional flows and security behaviours through the real UI (second browser suite).
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const PASSWORD = process.env.E2E_PASSWORD ?? "E2e-Demo-Password-2026";
const SHOTS = process.env.SHOT_DIR ?? "/tmp/e2e-shots/flows";
mkdirSync(SHOTS, { recursive: true });
const JUAN = "e0000000-0000-0000-0000-000000000005";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
let passed = 0;
const step = (n) => console.log(`\n=== ${n}`);
const ok = (c, m) => { if (!c) throw new Error(`FAIL: ${m}`); passed++; console.log(`  ok  ${m}`); };
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");

const sessions = {};
async function as(email) {
  if (sessions[email]) return sessions[email];
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(dashboard|privacy\/accept)/);
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/privacy/accept")) {
    await page.getByLabel(/I have read this notice/).check();
    await page.getByRole("button", { name: "Acknowledge and continue" }).click();
    await page.waitForURL(/\/dashboard/);
  }
  return (sessions[email] = { ctx, page });
}
const text = async (page) => { await page.locator("h1").first().waitFor(); await page.waitForLoadState("networkidle"); return (await page.locator("body").innerText()).replace(/\s+/g, " "); };
const go = async (page, path) => { await page.goto(`${BASE}${path}`); return text(page); };
const E = { juan: "juan.delacruz@demo.prc3.example", ana: "analiza.bautista@demo.prc3.example", lorna: "lorna.dizon@demo.prc3.example", paolo: "paolo.mercado@demo.prc3.example", teresita: "teresita.navarro@demo.prc3.example", admin: "admin@demo.prc3.example", edu: "eduardo.pascual@demo.prc3.example" };
const nextWeekday = (offset) => { const d = new Date(Date.now() + offset * 86400000); while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

try {
  // ------------------------------------------------------------------ Leave
  step("A. Leave: Ana files, supervisor approves, HR processes, balance is deducted");
  const ana = (await as(E.ana)).page;
  await go(ana, "/leave");
  const vlUsed = async () => Number((await ana.locator("section", { hasText: "Vacation Leave" }).first().locator("dl").innerText()).replace(/\s+/g, " ").match(/Used ([\d.]+)/)?.[1] ?? NaN);
  const usedBefore = await vlUsed();
  await go(ana, "/leave/new");
  await ana.getByLabel("Leave type").selectOption("VL");
  await ana.getByLabel("From").fill(nextWeekday(21)); await ana.getByLabel("To").fill(nextWeekday(21));
  await ana.getByLabel("Reason / remarks").fill("Family event");
  await ana.getByRole("button", { name: "Save and submit" }).click();
  await ana.getByText("Waiting at: For Supervisor Approval").waitFor();
  const leaveNo = /LV-\d{4}-\d{6}/.exec(await text(ana))?.[0];
  ok(!!leaveNo, `leave application ${leaveNo} submitted to the supervisor`);
  // an oversized request is refused with a clear message
  await go(ana, "/leave/new");
  await ana.getByLabel("Leave type").selectOption("VL");
  await ana.getByLabel("From").fill(nextWeekday(60)); await ana.getByLabel("To").fill("2027-12-31");
  await ana.getByLabel("Number of days").fill("90");
  await ana.getByRole("button", { name: "Save and submit" }).click();
  await ana.getByText(/Insufficient leave balance/).waitFor();
  ok(true, "leave beyond the available balance is refused");

  const lorna = (await as(E.lorna)).page;
  await go(lorna, "/approvals");
  await lorna.getByRole("link", { name: leaveNo }).click();
  await lorna.getByLabel("Remarks").first().fill("Endorsed");
  await lorna.getByRole("button", { name: "Approve", exact: true }).click();
  await lorna.getByText("Waiting at: For HR Processing").waitFor();
  ok(true, "supervisor approval moves it to HR processing");
  const paolo = (await as(E.paolo)).page;
  await go(paolo, "/approvals");
  await paolo.getByRole("link", { name: leaveNo }).click();
  await paolo.getByRole("button", { name: "Approve", exact: true }).click();
  await paolo.locator("h1 + p, header p").filter({ hasText: /Approved/ }).first().waitFor();
  ok(true, "HR processing approves the leave");
  await go(ana, "/leave");
  const usedAfter = await vlUsed();
  ok(usedAfter === usedBefore + 1, `approved leave deducted from the balance (${usedBefore} → ${usedAfter})`);

  // ------------------------------------------------------------------ HR request
  step("B. HR request: Certificate of Employment through to release");
  const juan = (await as(E.juan)).page;
  await go(juan, "/requests/new?type=COE");
  await juan.getByLabel("Subject").fill("COE for visa application");
  await juan.getByRole("button", { name: "Save and submit" }).click();
  await juan.getByText("Waiting at: Received / Under Review").waitFor();
  const hrUrl = juan.url();
  const hrNo = /HR-\d{4}-\d{6}/.exec(await text(juan))?.[0];
  ok(!!hrNo, `${hrNo} submitted`);
  await go(paolo, "/approvals"); await paolo.getByRole("link", { name: hrNo }).click();
  await paolo.getByRole("button", { name: "Approve", exact: true }).click();
  await paolo.getByText("Waiting at: For Approval").waitFor();
  ok(true, "HR staff received and reviewed it");
  await go(paolo, "/approvals");
  ok(!(await text(paolo)).includes(hrNo), "HR staff cannot approve at the approval step");
  const teresita = (await as(E.teresita)).page;
  await go(teresita, "/approvals"); await teresita.getByRole("link", { name: hrNo }).click();
  await teresita.getByRole("button", { name: "Approve", exact: true }).click();
  await teresita.getByText("Waiting at: For Release").waitFor();
  ok(true, "HR approver approved it");
  await go(paolo, hrUrl.replace(BASE, ""));
  await paolo.getByRole("button", { name: "Approve", exact: true }).click();
  await paolo.getByText(/Attach the generated document before releasing/).waitFor();
  ok(true, "release is blocked until the generated document is attached");
  await paolo.getByText("Upload the generated document").click();
  await paolo.locator("input[name=title]").last().fill("Certificate of Employment — Juan Dela Cruz");
  await paolo.locator("input[name=file]").last().setInputFiles({ name: "coe.pdf", mimeType: "application/pdf", buffer: PDF });
  await paolo.getByRole("button", { name: "Upload document" }).click();
  const generated = paolo.locator("select[name=document_id] option", { hasText: "Certificate of Employment — Juan Dela Cruz" });
  await generated.waitFor({ state: "attached" }); // the option list refreshes after the upload
  await paolo.getByLabel("Link as the released document").selectOption({ label: await generated.innerText() });
  await paolo.getByRole("button", { name: "Link document" }).click();
  await paolo.getByText("Document linked").waitFor();
  await paolo.getByLabel("Remarks").first().fill("Released");
  await paolo.getByRole("button", { name: "Approve", exact: true }).click();
  await paolo.getByText("Released", { exact: true }).first().waitFor(); // the status badge, not the card heading
  ok(true, "release completes once the document is linked");
  await go(juan, hrUrl.replace(BASE, ""));
  ok(/Released document/.test(await text(juan)) && /Document attached/.test(await text(juan)), "Juan sees the released document and the full timeline");
  const dlHref = await juan.getByRole("link", { name: "Download" }).first().getAttribute("href");
  const dl = await (await as(E.juan)).ctx.request.get(`${BASE}${dlHref}`);
  ok(dl.status() === 200 && /attachment/.test(dl.headers()["content-disposition"]), "Juan can download the released certificate");

  // ------------------------------------------------------------------ Employee records
  step("C. Employee records: create, validate, edit with a reason, change history");
  await go(teresita, "/personnel/new");
  await teresita.getByLabel("First name").fill("Maria"); await teresita.getByLabel("Last name").fill("Santiago");
  await teresita.getByLabel("Position", { exact: true }).selectOption({ label: "Administrative Assistant III" });
  await teresita.getByLabel("Employment status").selectOption("PERMANENT");
  await teresita.getByLabel("Date of birth").fill("1994-06-12");
  await teresita.getByLabel("TIN").fill("111-222-333-000");
  await teresita.getByLabel("Original appointment date").fill("2024-02-01");
  await teresita.getByLabel("Current appointment date").fill("2023-01-01");
  await teresita.getByRole("button", { name: "Create employee record" }).click();
  await teresita.getByText(/Cannot be earlier than the original appointment/).first().waitFor();
  ok(true, "impossible appointment dates are rejected with a clear message");
  ok((await teresita.getByLabel("First name").inputValue()) === "Maria" && (await teresita.getByLabel("TIN").inputValue()) === "111-222-333-000" && (await teresita.getByLabel("Employment status").inputValue()) === "PERMANENT", "the form keeps everything the user typed after a validation error");
  await teresita.getByLabel("Current appointment date").fill("2024-02-01");
  await teresita.getByRole("button", { name: "Create employee record" }).click();
  await teresita.waitForURL(/\/personnel\/[0-9a-f-]{36}$/);
  const newEmpUrl = teresita.url();
  ok(/Maria Santiago|Santiago, Maria/.test(await text(teresita)), "employee record created");
  await go(teresita, "/personnel/new");
  await teresita.getByLabel("First name").fill("Marie"); await teresita.getByLabel("Last name").fill("Dup");
  await teresita.getByLabel("TIN").fill("111-222-333-000");
  await teresita.getByRole("button", { name: "Create employee record" }).click();
  await teresita.getByText(/TIN is already recorded for another employee/).waitFor();
  ok(true, "duplicate government ID is detected");
  await go(teresita, newEmpUrl.replace(BASE, "") + "/edit");
  await teresita.getByLabel("Position number").fill("PN-4521");
  await teresita.getByRole("button", { name: "Save changes" }).click();
  ok(await teresita.locator("textarea[name=reason]").evaluate((el) => !el.validity.valid) && /edit/.test(teresita.url()), "a reason is required before an employee record can be changed");
  await teresita.locator("textarea[name=reason]").fill("Encoding correction");
  await teresita.getByRole("button", { name: "Save changes" }).click();
  await teresita.waitForURL(/\/personnel\/[0-9a-f-]{36}$/);
  await go(teresita, newEmpUrl.replace(BASE, "") + "?tab=history");
  const hist = await text(teresita);
  ok(/position_number/.test(hist) && /PN-4521/.test(hist) && /Encoding correction/.test(hist) && /Teresita M\. Navarro/.test(hist), "change history shows field, new value, reason and who");
  ok(!/111-222-333-000/.test(hist), "government ID values never appear in change history");

  // ------------------------------------------------------------------ PDS
  step("D. PDS: add / edit / remove entries, certify, HR verifies");
  await go(juan, "/pds");
  const sec = juan.locator("section", { hasText: "Learning and development" }).first();
  await sec.getByText("Add an entry").click();
  await sec.getByLabel("Title of program").fill("Records Management Seminar");
  await sec.getByLabel("Number of hours").fill("16");
  await sec.getByRole("button", { name: "Add entry" }).click();
  await juan.getByText("Records Management Seminar").first().waitFor();
  ok(true, "PDS entry added");
  await juan.locator("tr", { hasText: "Records Management Seminar" }).getByRole("link", { name: "Edit" }).click();
  await juan.getByRole("button", { name: "Save entry" }).waitFor(); // the edit form has replaced the add form
  await juan.locator("section", { hasText: "Learning and development" }).first().getByLabel("Number of hours").fill("24");
  await juan.getByRole("button", { name: "Save entry" }).click();
  await juan.locator("tr", { hasText: "Records Management Seminar" }).getByText("24").waitFor();
  ok(true, "PDS entry edited");
  await juan.getByLabel("I certify that the information").check();
  await juan.getByRole("button", { name: "Certify my PDS" }).click();
  await juan.getByText(/certified and sent to HR/).waitFor();
  ok(true, "employee certified the PDS");
  await go(teresita, `/pds/${JUAN}`);
  ok(/awaiting HR verification/.test(await text(teresita)), "HR sees it awaiting verification");
  await teresita.getByLabel("HR review outcome").selectOption("verified");
  await teresita.getByRole("button", { name: "Record review" }).click();
  await teresita.getByText("PDS marked as verified").waitFor();
  ok(true, "HR verified the PDS");
  await juan.locator("tr", { hasText: "Records Management Seminar" }).getByRole("button", { name: "Remove" }).click();
  await juan.waitForFunction(() => !document.body.innerText.includes("Records Management Seminar"));
  ok(true, "PDS entry removed");

  // ------------------------------------------------------------------ Service record
  step("E. Service record: overlapping periods are rejected");
  await go(teresita, `/service-record/${JUAN}`);
  const form = teresita.locator("section", { hasText: "Add an entry" }).last();
  await form.getByLabel("Date from").fill("2023-06-01");
  await form.getByLabel("Position").fill("Overlapping entry");
  await form.getByRole("button", { name: "Add entry" }).click();
  await teresita.getByText(/dates overlap another service record/).waitFor();
  ok(true, "overlapping service period is rejected with a clear message");
  await go(teresita, `/service-record/${JUAN}`);
  const f2 = teresita.locator("section", { hasText: "Add an entry" }).last();
  await f2.getByLabel("Date from").fill("2017-01-01"); await f2.getByLabel("Date to").fill("2018-12-31");
  await f2.getByLabel("Position").fill("Administrative Aide VI");
  await f2.getByRole("button", { name: "Add entry" }).click();
  await teresita.getByText("Administrative Aide VI").waitFor();
  ok(true, "valid earlier service entry added in chronological order");

  // ------------------------------------------------------------------ Import
  step("F. Data import: map, validate, preview, confirm; invalid rows are never imported");
  const csv = ["Surname,Given Name,DOB,Designation,Employment Status,Office,Date Hired",
    "Reyes,Carlo,1990-05-04,Administrative Assistant III,Permanent,Human Resource Management Unit,2020-01-06",
    "Lim,Joy,1992-02-11,Accountant II,Casual,Finance Section,2021-03-01",
    "Bad,Row,05/04/1990,Nonexistent Position,Permanent,Finance Section,2019-01-01"].join("\n");
  writeFileSync("/tmp/e2e-import.csv", csv);
  await go(teresita, "/import");
  await teresita.locator("input[name=file]").setInputFiles("/tmp/e2e-import.csv");
  await teresita.getByRole("button", { name: "Upload and continue" }).click();
  await teresita.getByRole("button", { name: "Validate rows" }).waitFor();
  ok(true, "columns detected and mapped automatically");
  await teresita.getByRole("button", { name: "Validate rows" }).click();
  await teresita.getByText("Problems found").waitFor();
  let t = await text(teresita);
  ok(/Bad, Row/.test(t) && /Invalid date/.test(t) && /Unknown position/.test(t), "the bad row is reported with each problem");
  const batchUrl = teresita.url();
  const errCsv = await (await as(E.teresita)).ctx.request.get(`${batchUrl}/errors`);
  ok(errCsv.status() === 200 && /Spreadsheet row/.test(await errCsv.text()), "error report downloads as CSV");
  await teresita.getByRole("button", { name: /^Import 2 record/ }).click();
  await teresita.getByText(/Imported 2 record/).first().waitFor();
  ok(true, "only the 2 valid rows were imported");
  t = await go(teresita, "/personnel?q=Reyes");
  ok(/Reyes, Carlo/.test(t), "imported employee is searchable");
  t = await go(teresita, "/personnel?q=Bad");
  ok(!/Bad, Row/.test(t), "the invalid row was not imported");

  // ------------------------------------------------------------------ Documents
  step("G. Documents: replace creates a new version; HR review; delete is soft");
  await go(juan, "/documents");
  await juan.locator("select[name=category_code]").selectOption("DIPLOMA");
  await juan.getByLabel("Title").fill("BS Public Administration diploma");
  await juan.locator("input[name=file]").setInputFiles({ name: "diploma.pdf", mimeType: "application/pdf", buffer: PDF });
  await juan.getByRole("button", { name: "Upload document" }).click();
  await juan.waitForURL(/\/documents\/[0-9a-f-]{36}$/);
  const docPath = new URL(juan.url()).pathname;
  const PDF2 = Buffer.concat([PDF, Buffer.from("\n% second scan\n")]);
  await juan.getByLabel("New file").setInputFiles({ name: "diploma-rescan.pdf", mimeType: "application/pdf", buffer: PDF2 });
  await juan.getByLabel("Reason for replacing").fill("Clearer scan");
  await juan.getByRole("button", { name: "Upload new version" }).click();
  await juan.getByText("New version uploaded").waitFor();
  t = await text(juan);
  ok(/v2/.test(t) && /v1/.test(t) && /Clearer scan/.test(t), "both versions are kept with the reason");
  await go(teresita, docPath);
  await teresita.getByLabel("Outcome").selectOption("verified");
  await teresita.getByRole("button", { name: "Record outcome" }).click();
  await teresita.getByText("Marked as verified").waitFor();
  ok(true, "HR verified the document");
  await teresita.locator("form", { hasText: "Delete document" }).getByLabel("Reason").fill("Duplicate record");
  await teresita.getByRole("button", { name: "Delete document" }).click();
  await teresita.waitForURL(/\/documents$/);
  await go(juan, "/documents");
  ok(!(await text(juan)).includes("BS Public Administration diploma"), "deleted document no longer appears for the employee");
  const gone = await (await as(E.juan)).ctx.request.get(`${BASE}${docPath}/file`);
  ok(gone.status() === 404, "its file is no longer retrievable by the employee");

  // ------------------------------------------------------------------ Admin
  step("H. Administration: lookups, roles, graceful failure without an email provider");
  const admin = (await as(E.admin)).page;
  await go(admin, "/admin/t/positions");
  await admin.getByLabel("Code").fill("TESTPOS"); await admin.getByLabel("Position title").fill("Test Position (admin demo)"); await admin.getByLabel("Salary grade").fill("10");
  await admin.getByRole("button", { name: "Add", exact: true }).click();
  await admin.getByText("Test Position (admin demo)").waitFor();
  ok(true, "administrator added a position without any code change");
  await go(admin, "/admin/t/org-units");
  await admin.getByLabel("Code").fill("TESTSVC"); await admin.getByLabel("Name").fill("Offsite Service Center B (test)");
  await admin.getByLabel("Type").selectOption("service_center");
  await admin.getByLabel("Reports to (parent unit)").selectOption({ index: 1 });
  await admin.getByRole("button", { name: "Add", exact: true }).click();
  await admin.getByText("Offsite Service Center B (test)").first().waitFor();
  ok(true, "administrator added an organizational unit");
  await go(admin, "/admin/roles/new");
  await admin.getByLabel("Role code").fill("RECORDS_OFFICER"); await admin.getByLabel("Role name").fill("Records Officer");
  await admin.locator("input[value='document.read_all']").check();
  await admin.getByRole("button", { name: "Save role" }).click();
  await admin.waitForURL(/\/admin\/roles\/[0-9a-f-]{36}$/);
  ok(/Records Officer/.test(await text(admin)), "custom role created with selected permissions");
  await go(admin, "/admin/users");
  await admin.getByLabel("Email address").fill("new.hire@demo.prc3.example"); await admin.getByLabel("Display name").fill("New Hire");
  await admin.getByRole("button", { name: "Send invitation" }).click();
  await admin.getByText(/aren't configured on this server|invitation/i).first().waitFor();
  ok(!/service_role|SUPABASE_SERVICE/.test(await text(admin)), "invitation without a provider fails gracefully (no technical details)");
  await go(admin, "/admin/settings");
  ok(/audit\.capture_network_metadata/.test(await text(admin)) && /never shown or stored here/.test(await text(admin)), "settings page explains secrets are not stored");

  // ------------------------------------------------------------------ Notifications
  step("I. Notifications");
  await go(juan, "/notifications");
  await juan.getByRole("button", { name: "Mark all as read" }).click();
  await juan.waitForFunction(() => !document.body.innerText.includes("Mark all as read"));
  ok(true, "notifications can be marked as read");

  // ------------------------------------------------------------------ Auth & session security
  step("J. Authentication and session security");
  const anonCtx = await browser.newContext(); const ap = await anonCtx.newPage();
  await ap.goto(`${BASE}/login`);
  await ap.getByLabel("Email address").fill(E.juan); await ap.getByLabel("Password").fill("wrong-password-123");
  await ap.getByRole("button", { name: "Sign in" }).click();
  await ap.getByText("Incorrect email or password.").waitFor();
  ok(true, "wrong password shows a generic message");
  await ap.getByLabel("Email address").fill("nobody@demo.prc3.example"); await ap.getByLabel("Password").fill("wrong-password-123");
  await ap.getByRole("button", { name: "Sign in" }).click();
  await ap.getByText("Incorrect email or password.").waitFor();
  ok(true, "unknown account gets the identical message (no account enumeration)");
  for (let i = 0; i < 5; i++) { await ap.getByLabel("Password").fill(`wrong-password-${i}`); await ap.getByRole("button", { name: "Sign in" }).click(); await ap.waitForTimeout(250); }
  await ap.getByText(/Too many sign-in attempts/).waitFor({ timeout: 10000 });
  ok(true, "repeated failures are rate-limited");
  await ap.goto(`${BASE}/forgot-password`);
  await ap.getByLabel("Email address").fill("nobody@demo.prc3.example");
  await ap.getByRole("button", { name: "Send reset link" }).click();
  await ap.getByText(/If that email belongs to an account/).waitFor();
  ok(true, "password reset gives the same answer for any email");
  // open redirect
  const ctx2 = await browser.newContext(); const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/login?next=//evil.example/steal`);
  await p2.getByLabel("Email address").fill(E.ana); await p2.getByLabel("Password").fill(PASSWORD);
  await p2.getByRole("button", { name: "Sign in" }).click();
  await p2.waitForURL(/\/(dashboard|privacy)/); await p2.waitForLoadState("networkidle");
  ok(new URL(p2.url()).host === new URL(BASE).host, "post-login redirect cannot leave the site");
  // idle timeout (server-side)
  await ctx2.addCookies([{ name: "ehris_last_active", value: String(Date.now() - 3 * 3600_000), url: BASE }]);
  await p2.goto(`${BASE}/dashboard`);
  await p2.waitForURL(/\/login\?reason=timeout/);
  ok(/signed out because of inactivity/i.test(await text(p2)), "an idle session is signed out");
  await p2.goto(`${BASE}/dashboard`);
  ok(new URL(p2.url()).pathname === "/login", "after timeout the old session no longer works");
  // logout
  const jp = (await as(E.juan)).page;
  await go(jp, "/dashboard");
  await jp.getByRole("button", { name: "Sign out" }).click();
  await jp.waitForURL(/\/login/);
  await jp.goto(`${BASE}/dashboard`);
  ok(new URL(jp.url()).pathname === "/login", "after sign-out protected pages redirect to login");
  const head = await (await browser.newContext()).request.get(`${BASE}/login`);
  const h = head.headers();
  ok(/nonce-/.test(h["content-security-policy"] ?? "") && /frame-ancestors 'none'/.test(h["content-security-policy"]) && h["x-content-type-options"] === "nosniff" && !!h["strict-transport-security"], "security headers (CSP with nonce, nosniff, HSTS) are present");

  // ------------------------------------------------------------------ Direct API
  step("K. Direct API attacks (bypassing the UI) with a real employee token");
  const api = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const tokenRes = await fetch(`${api}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: E.ana, password: PASSWORD }) });
  const token = (await tokenRes.json()).access_token;
  const rest = (path, init = {}, bearer = token) => fetch(`${api}/rest/v1/${path}`, { ...init, headers: { apikey: anonKey, authorization: `Bearer ${bearer}`, "content-type": "application/json", ...(init.headers ?? {}) } });
  let r = await rest("employee_private?select=employee_id,tin");
  let rows = await r.json();
  ok(r.status === 200 && rows.length === 1 && rows[0].employee_id !== JUAN, "direct query of government identifiers returns only the caller's own row");
  r = await rest(`employee_private?employee_id=eq.${JUAN}&select=tin`);
  ok((await r.json()).length === 0, "asking for a colleague's identifiers by id (IDOR) returns nothing");
  r = await rest(`employees?id=eq.${JUAN}&select=*`);
  ok((await r.json()).length === 0, "asking for a colleague's employee record by id returns nothing");
  r = await rest("service_records?select=*");
  ok((await r.json()).every((x) => x.employee_id !== JUAN), "service records of others are not returned");
  r = await rest("audit_logs?select=*");
  ok((await r.json()).length === 0, "audit log is empty for an ordinary employee");
  r = await rest("audit_logs", { method: "POST", body: JSON.stringify({ actor_label: "x", action: "forged", module: "x" }) });
  ok(r.status >= 400, "forging an audit record is refused");
  r = await rest("employees?id=eq." + JUAN, { method: "PATCH", body: JSON.stringify({ salary_grade: 33 }) });
  ok(r.status >= 400, "changing someone's employee record directly is refused");
  r = await rest("rpc/hr_save_employee", { method: "POST", body: JSON.stringify({ p_employee_id: JUAN, p_core: { salary_grade: 33 }, p_private: {}, p_reason: "x" }) });
  ok(r.status >= 400, "the HR save function refuses an ordinary employee");
  r = await rest("rpc/notify", { method: "POST", body: JSON.stringify({ p_user_id: "00000000-0000-0000-0000-000000000000", p_type: "x", p_title: "forged" }) });
  ok(r.status >= 400, "internal functions (notify) are not callable");
  r = await rest("leave_applications", { method: "POST", body: JSON.stringify({ employee_id: JUAN, leave_type_code: "VL", date_from: "2030-01-01", date_to: "2030-01-01" }) });
  ok(r.status >= 400, "filing a request in someone else's name is refused");
  r = await rest("hr_requests", { method: "POST", body: JSON.stringify({ employee_id: (await (await rest("profiles?select=employee_id")).json())[0].employee_id, request_type_code: "COE", subject: "x", status: "completed", request_no: "HR-FORGED" }), headers: { prefer: "return=representation" } });
  const forged = await r.json().catch(() => null);
  ok(r.status === 201 && forged?.[0]?.status === "draft" && forged?.[0]?.request_no !== "HR-FORGED", "a client cannot forge a request number or start a request as 'completed'");
  r = await fetch(`${api}/rest/v1/employees?select=*`, { headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` } });
  ok(r.status >= 400, "the anonymous role cannot read any table");
  r = await fetch(`${api}/rest/v1/employees?select=*`);
  ok(r.status >= 400, "a request with no credentials is refused");
  r = await fetch(`${api}/storage/v1/object/authenticated/personnel-documents/${JUAN}/anything.pdf`, { headers: { authorization: `Bearer ${token}` } });
  ok(r.status === 404, "storage: a colleague's files cannot be fetched directly");
  r = await fetch(`${api}/storage/v1/object/personnel-documents/${JUAN}/evil.pdf`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/pdf" }, body: PDF });
  ok(r.status === 403, "storage: uploading into a colleague's folder is refused");
  r = await fetch(`${api}/rest/v1/employees?select=*`, { headers: { apikey: anonKey, authorization: "Bearer not-a-valid-token" } });
  ok(r.status === 401, "a tampered/invalid token is rejected");

  console.log(`\nALL ${passed} FLOW CHECKS PASSED`);
} catch (e) {
  console.error(`\n${e.message}`);
  for (const [email, s] of Object.entries(sessions)) { try { await s.page.screenshot({ path: `${SHOTS}/failure-${email.split("@")[0]}.png`, fullPage: true }); } catch {} }
  process.exitCode = 1;
} finally {
  await browser.close();
}
