// Visits every screen as the roles that can see it; fails on server errors, error boundaries or leaked technical text.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const PASSWORD = process.env.E2E_PASSWORD ?? "E2e-Demo-Password-2026";
const SHOTS = process.env.SHOT_DIR ?? "/tmp/e2e-shots/tour";
mkdirSync(SHOTS, { recursive: true });
const JUAN = "e0000000-0000-0000-0000-000000000005";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
let visited = 0;
const failures = [];

async function login(email, viewport = { width: 1360, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
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
  return { ctx, page };
}

async function visit(page, who, path, { expect, name } = {}) {
  const res = await page.goto(`${BASE}${path}`);
  await page.locator("h1").first().waitFor({ timeout: 15000 }).catch(() => {});
  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  visited++;
  const problems = [];
  if (!res || res.status() >= 400) problems.push(`HTTP ${res?.status()}`);
  if (/We couldn't complete this request|Application error|Internal Server Error|This page couldn't load|PostgrestError|relation .* does not exist|permission denied for/i.test(body)) problems.push("error text on page");
  if (/You don't have access to this page/.test(body)) problems.push("no-access page");
  if (expect && !new RegExp(expect.source, "i").test(body)) problems.push(`missing ${expect}`);
  if (problems.length) failures.push(`${who} ${path}: ${problems.join("; ")}`);
  const file = `${who}-${(name ?? path).replace(/[^a-z0-9]+/gi, "_").slice(0, 60)}.png`;
  await page.screenshot({ path: `${SHOTS}/${file}`, fullPage: true });
  console.log(`${problems.length ? "FAIL" : "ok  "} ${who.padEnd(9)} ${path}${problems.length ? "  ← " + problems.join("; ") : ""}`);
}


// Super admin
{
  const { page } = await login("admin@demo.prc3.example");
  for (const [p, e] of [
    ["/dashboard", /HR overview|Management/], ["/dashboard?view=hr", /Workforce summary/], ["/dashboard?view=management", /Management dashboard/],
    ["/personnel", /Personnel Records/], ["/personnel/new", /New employee record/], ["/reports", /Reports/], ["/reports/masterlist", /Personnel masterlist/],
    ["/reports/by-division", /Headcount/], ["/reports/by-status", /Headcount/], ["/reports/plantilla", /Item no/i], ["/reports/leave-summary", /Leave summary/],
    ["/reports/attendance-summary", /Attendance summary/], ["/reports/hr-requests", /HR requests/], ["/reports/movement", /Personnel movement/],
    ["/reports/document-compliance", /Document compliance/], ["/reports/training", /Training/], ["/reports/service-record?employee=DEMO-0005", /Administrative Assistant III/],
    ["/data-quality", /Data quality/], ["/import", /Data import/], ["/admin", /Administration/], ["/admin/users", /Invite a user/], ["/admin/roles", /Roles & permissions/],
    ["/admin/roles/new", /New role/], ["/admin/t/org-units", /Organizational units/], ["/admin/t/positions", /Positions/], ["/admin/t/plantilla", /Plantilla items/],
    ["/admin/t/unit-types", /unit types/i], ["/admin/t/employment-statuses", /Employment statuses/], ["/admin/t/attendance-statuses", /Attendance statuses/],
    ["/admin/t/leave-types", /Leave types/], ["/admin/t/document-categories", /Document categories/], ["/admin/t/request-types", /HR request types/],
    ["/admin/t/declaration-questions", /declaration/i], ["/admin/t/holidays", /Holidays/], ["/admin/workflows", /Workflows/], ["/admin/settings", /System settings/],
    ["/admin/integrations", /None of these integrations is active/], ["/admin/ai", /not configured/], ["/audit", /Audit logs/], ["/notifications", /Notifications/],
  ]) await visit(page, "admin", p, { expect: e });
  await page.goto(`${BASE}/admin/roles`);
  const href = await page.getByRole("link", { name: /^(Edit|View)$/ }).nth(1).getAttribute("href");
  await visit(page, "admin", href, { expect: /Role code/, name: "role-edit" });
}
// HR admin
{
  const { page } = await login("teresita.navarro@demo.prc3.example");
  for (const [p, e] of [
    ["/dashboard", /Good (morning|afternoon|evening)/], ["/dashboard?view=hr", /Pending actions/], ["/personnel", /Personnel Records/], [`/personnel/${JUAN}`, /Government employment information/],
    [`/personnel/${JUAN}?tab=history`, /Change history/], [`/personnel/${JUAN}/edit`, /Reason for change/], [`/pds/${JUAN}`, /Educational background/], [`/service-record/${JUAN}`, /Add an entry/],
    [`/documents?employee=${JUAN}`, /Documents/], [`/leave?employee=${JUAN}`, /Maintain balance/], [`/attendance?employee=${JUAN}`, /Daily records/], ["/attendance/team", /Team attendance/],
    ["/requests?scope=all", /All requests/], ["/approvals", /For my action/], ["/reports/leave-summary", /Leave summary/], ["/data-quality", /Possible duplicate|Required document|issues|No issues/i],
    ["/import", /Data import/], ["/admin", /Administration/], ["/admin/t/positions", /Positions/],
  ]) await visit(page, "hradmin", p, { expect: e });
}
// HR staff
{
  const { page } = await login("paolo.mercado@demo.prc3.example");
  for (const [p, e] of [["/dashboard?view=hr", /Workforce summary/], ["/personnel", /Personnel Records/], ["/requests?scope=all", /All requests/], ["/reports", /Reports/], ["/data-quality", /Data quality/]])
    await visit(page, "hrstaff", p, { expect: e });
}
// Executive
{
  const { page } = await login("ricardo.villanueva@demo.prc3.example");
  await visit(page, "exec", "/dashboard?view=management", { expect: /Management dashboard/ });
  await visit(page, "exec", "/dashboard", { expect: /Good (morning|afternoon|evening)/ });
}
// Supervisor
{
  const { page } = await login("lorna.dizon@demo.prc3.example");
  for (const [p, e] of [["/dashboard", /Good/], ["/personnel", /Dela Cruz/], ["/attendance/team", /Team attendance/], ["/approvals", /For my action/], ["/leave", /My Leave/]]) await visit(page, "supervisor", p, { expect: e });
}
// Employee (desktop + mobile)
{
  const { page } = await login("juan.delacruz@demo.prc3.example");
  for (const [p, e] of [["/dashboard", /Profile completion/], ["/profile", /Profile completion/], ["/pds", /Personal Data Sheet/], ["/service-record", /Service Record/], ["/documents", /My Documents/],
    ["/attendance", /Daily Time Record/], ["/attendance/corrections", /corrections/], ["/attendance/corrections/new", /Request attendance correction/], ["/leave", /My Leave/], ["/leave/new", /File leave/],
    ["/requests", /HR Requests/], ["/requests/new", /New HR request/], ["/notifications", /Notifications/], ["/privacy", /Privacy Notice/]])
    await visit(page, "juan", p, { expect: e });
  const m = await login("juan.delacruz@demo.prc3.example", { width: 390, height: 844 });
  await visit(m.page, "mobile", "/dashboard", { expect: /Profile completion/, name: "dashboard" });
  await visit(m.page, "mobile", "/attendance", { expect: /Daily Time Record/, name: "dtr" });
  await m.page.getByRole("button", { name: "Open menu" }).click();
  await m.page.screenshot({ path: `${SHOTS}/mobile-menu-open.png` });
  const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) failures.push("mobile: horizontal page scroll on dashboard/dtr");
}
// Forbidden access for non-privileged roles
{
  const { page } = await login("juan.delacruz@demo.prc3.example");
  for (const p of ["/personnel", "/reports", "/audit", "/admin", "/admin/users", "/data-quality", "/import", "/dashboard?view=hr"]) {
    await page.goto(`${BASE}${p}`);
    await page.locator("h1").first().waitFor().catch(() => {});
    const body = await page.locator("body").innerText();
    const blocked = /don't have access|Page not found|404/i.test(body) || (p.includes("view=hr") && !/Workforce summary/.test(body));
    if (!blocked) failures.push(`juan ${p}: employee should not see this page`);
    else console.log(`ok   juan      ${p} is denied`);
    visited++;
  }
}
await browser.close();
console.log(`\nvisited ${visited} screens`);
if (failures.length) { console.error(`\n${failures.length} FAILURES:\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("TOUR PASSED");
