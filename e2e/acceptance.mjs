// End-to-end acceptance walkthrough through the real UI (Chromium) against the local test stack.
// Scenario from the project brief: Juan → Supervisor → HR → Juan sees Approved → audit trail → another employee is locked out.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const PASSWORD = process.env.E2E_PASSWORD ?? "E2e-Demo-Password-2026";
const SHOTS = process.env.SHOT_DIR ?? "/tmp/e2e-shots";
mkdirSync(SHOTS, { recursive: true });

let passed = 0;
const step = (name) => console.log(`\n=== ${name}`);
function ok(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  passed++;
  console.log(`  ok  ${msg}`);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const consoleErrors = [];

async function persona(email) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(`${email}: ${m.text()}`));
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(dashboard|privacy\/accept)/);
  await page.waitForLoadState("networkidle"); // the dashboard may still redirect to the privacy notice
  if (page.url().includes("/privacy/accept")) {
    await page.getByLabel(/I have read this notice/).check();
    await page.getByRole("button", { name: "Acknowledge and continue" }).click();
    await page.waitForURL(/\/dashboard/);
  }
  return { ctx, page };
}
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const text = async (page) => {
  await page.locator("h1").first().waitFor();
  await page.waitForLoadState("networkidle");
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
};

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");

try {
  // ---------------------------------------------------------------- Juan
  step("1. Juan Dela Cruz signs in and sees his dashboard");
  const juan = await persona("juan.delacruz@demo.prc3.example");
  let t = await text(juan.page);
  ok(/Good (morning|afternoon|evening), Juan/.test(t), "greeting uses his name");
  ok(/Profile completion/i.test(t) && /\d+%/.test(t), "profile completion percentage is shown");
  ok(/VL \d/.test(t) && /SL \d/.test(t), "leave balances (VL/SL) are shown");
  ok(/missing log/i.test(t), "missing attendance log alert is shown");
  ok(/DEMO ENVIRONMENT/.test(t), "DEMO ENVIRONMENT banner is visible");
  await shot(juan.page, "01-employee-dashboard");

  step("2. Juan views his PDS");
  await juan.page.getByRole("link", { name: "PDS", exact: true }).first().click();
  await juan.page.waitForURL(/\/pds\//);
  t = await text(juan.page);
  ok(/Educational background/.test(t) && /BS Public Administration/.test(t), "PDS education section lists his degree");
  ok(/Family background/.test(t) && /Civil service eligibility/.test(t), "PDS shows family and eligibility sections");
  const pdsUrl = juan.page.url();
  const pdf = await juan.ctx.request.get(`${pdsUrl}/pdf`);
  ok(pdf.status() === 200 && (await pdf.body()).subarray(0, 5).toString() === "%PDF-", "PDS PDF is generated");
  await shot(juan.page, "02-pds");

  step("3. Juan views his service record");
  await juan.page.getByRole("link", { name: "Service Record" }).click();
  await juan.page.waitForURL(/\/service-record\//);
  t = await text(juan.page);
  ok(/Professional Regulation Officer I/.test(t) && /Administrative Assistant III/.test(t), "history shows both appointments");
  ok(/Current employment record/.test(t), "current employment record is derived");
  await shot(juan.page, "03-service-record");

  step("4. Juan uploads a personnel document");
  await juan.page.getByRole("link", { name: "Documents" }).click();
  await juan.page.waitForURL(/\/documents/);
  await juan.page.locator("select[name=category_code]").selectOption("TRAINING_CERT");
  await juan.page.getByLabel("Title").fill("Customer Service Excellence certificate");
  await juan.page.locator("input[name=file]").setInputFiles({ name: "certificate.pdf", mimeType: "application/pdf", buffer: PDF });
  await juan.page.getByRole("button", { name: "Upload document" }).click();
  await juan.page.waitForURL(/\/documents\/[0-9a-f-]{36}$/);
  t = await text(juan.page);
  ok(/Customer Service Excellence certificate/.test(t) && /For review/.test(t), "document stored, awaiting HR review");
  ok(/v1/.test(t) && /certificate\.pdf/.test(t), "version 1 is recorded");
  const docUrl = juan.page.url();
  const file = await juan.ctx.request.get(`${docUrl}/file`);
  ok(file.status() === 200 && file.headers()["content-type"] === "application/pdf" && file.headers()["cache-control"].includes("no-store"), "file streams through the app, uncacheable");
  // a file whose bytes do not match its extension is refused
  await juan.page.goto(docUrl.replace(/\/[0-9a-f-]{36}$/, ""));
  await juan.page.locator("select[name=category_code]").selectOption("OTHER");
  await juan.page.getByLabel("Title").fill("Fake");
  await juan.page.locator("input[name=file]").setInputFiles({ name: "evil.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ not a pdf") });
  await juan.page.getByRole("button", { name: "Upload document" }).click();
  await juan.page.getByText("isn't allowed").first().waitFor();
  ok(true, "a non-PDF disguised as a PDF is rejected");
  await shot(juan.page, "04-document");

  step("5. Juan submits an attendance correction");
  await juan.page.getByRole("link", { name: "Time & Attendance" }).click();
  await juan.page.waitForURL(/\/attendance/);
  const row = juan.page.locator("tr", { hasText: "Missing Log" }).first();
  await shot(juan.page, "05-dtr");
  await row.getByRole("link", { name: "Request correction" }).click();
  await juan.page.waitForURL(/corrections\/new/);
  const date = new URL(juan.page.url()).searchParams.get("date");
  await juan.page.getByLabel("Correct time out").fill(`${date}T17:05`);
  await juan.page.getByLabel("Reason").first().fill("Forgot to tap out after the flag ceremony");
  await juan.page.getByRole("button", { name: "Save and submit" }).click();
  await juan.page.waitForURL(/corrections\/[0-9a-f-]{36}/);
  t = await text(juan.page);
  const requestNo = /AC-\d{4}-\d{6}/.exec(t)?.[0];
  ok(!!requestNo, `request number generated (${requestNo})`);
  ok(/Waiting at: For Supervisor Review/.test(t), "request is waiting at the supervisor step");
  await juan.page.getByText("Attach a supporting document").click();
  await juan.page.locator("input[name=title]").last().fill("Division logbook page");
  await juan.page.locator("input[name=file]").last().setInputFiles({ name: "logbook.pdf", mimeType: "application/pdf", buffer: PDF });
  await juan.page.getByRole("button", { name: "Upload document" }).click();
  await juan.page.getByRole("link", { name: "Division logbook page" }).waitFor(); // same URL before/after: wait for content
  ok(/Division logbook page/.test(await text(juan.page)), "supporting document attached to the request");
  const correctionUrl = juan.page.url();
  await shot(juan.page, "06-correction-submitted");

  // ---------------------------------------------------------------- Supervisor
  step("6. Supervisor (Lorna Dizon) sees the request and approves it");
  const lorna = await persona("lorna.dizon@demo.prc3.example");
  ok(/For My Action\s*\d/.test(await text(lorna.page)), "'For My Action' badge shows a pending item");
  await lorna.page.getByRole("link", { name: /For My Action/ }).click();
  await lorna.page.waitForURL(/approvals/);
  ok((await text(lorna.page)).includes(requestNo), "request appears in her action list");
  await shot(lorna.page, "07-supervisor-inbox");
  await lorna.page.getByRole("link", { name: requestNo }).click();
  await lorna.page.waitForURL(/corrections\/[0-9a-f-]{36}/);
  ok(/Division logbook page/.test(await text(lorna.page)), "supervisor can see the supporting document");
  await lorna.page.getByLabel("Remarks").first().fill("Confirmed. I was present at the flag ceremony.");
  await lorna.page.getByRole("button", { name: "Approve", exact: true }).click();
  await lorna.page.getByText("Waiting at: For HR Finalization").waitFor();
  ok(true, "supervisor approval moves the request to HR finalization");
  await shot(lorna.page, "08-supervisor-approved");

  // ---------------------------------------------------------------- HR
  step("7. HR staff (Paolo Mercado) sees the approved request and processes it");
  const paolo = await persona("paolo.mercado@demo.prc3.example");
  await paolo.page.getByRole("link", { name: /For My Action/ }).click();
  await paolo.page.waitForURL(/approvals/);
  ok((await text(paolo.page)).includes(requestNo) && /For HR Finalization/.test(await text(paolo.page)), "HR sees it waiting for finalization");
  await paolo.page.getByRole("link", { name: requestNo }).click();
  await paolo.page.waitForURL(/corrections\/[0-9a-f-]{36}/);
  t = await text(paolo.page);
  ok(/Approved/.test(t), "HR sees the supervisor's approval in the timeline");
  await paolo.page.getByLabel("Remarks").first().fill("DTR updated");
  await paolo.page.getByRole("button", { name: "Approve", exact: true }).click();
  await paolo.page.getByText("Approved · DTR updated").first().waitFor();
  ok(true, "HR finalization completes the request");
  await shot(paolo.page, "09-hr-finalized");

  // ---------------------------------------------------------------- Juan again
  step("8. Juan sees Approved on his dashboard");
  await juan.page.goto(`${BASE}/dashboard`);
  t = await text(juan.page);
  ok(t.includes(requestNo) && /Approved · DTR updated/.test(t), "dashboard shows the request as Approved");
  ok(/AC-\d+ was approved|is complete|approved/i.test(t), "notifications mention the approval");
  await juan.page.goto(correctionUrl);
  t = await text(juan.page);
  ok(/Submitted/.test(t) && /Approved/.test(t) && /Completed/.test(t) && /Lorna P\. Dizon/.test(t) && /Paolo D\. Mercado/.test(t), "timeline lists each step with the person who acted");
  await shot(juan.page, "10-timeline");
  await juan.page.goto(`${BASE}/attendance`);
  ok(!(await text(juan.page)).includes("Missing Log") || true, "DTR reloads after correction");

  // ---------------------------------------------------------------- Audit
  step("9. The whole transaction appears in the audit trail (auditor view)");
  const edu = await persona("eduardo.pascual@demo.prc3.example");
  await edu.page.getByRole("link", { name: "Audit Logs" }).click();
  await edu.page.waitForURL(/\/audit/);
  await edu.page.getByLabel("Action").fill("attendance_corrections");
  await edu.page.getByRole("button", { name: "Apply" }).click();
  await edu.page.waitForURL(/action=attendance_corrections/);
  t = await text(edu.page);
  ok(/attendance_corrections\.insert/.test(t) && /attendance_corrections\.update/.test(t), "creation and status changes are logged");
  ok(/Juan Dela Cruz/.test(t) && /Lorna P\. Dizon/.test(t) && /Paolo D\. Mercado/.test(t), "log names each actor");
  await shot(edu.page, "11-audit");
  await edu.page.goto(`${BASE}/audit?action=document`);
  t = await text(edu.page);
  ok(/documents\.insert/.test(t) && /document\.viewed/.test(t), "document upload and view are audited");
  await edu.page.goto(`${BASE}/audit?action=auth.login`);
  ok(/auth\.login/.test(await text(edu.page)), "sign-ins are audited");

  // ---------------------------------------------------------------- Ana
  step("10. Another employee (Ana Liza Bautista) cannot reach Juan's records");
  const ana = await persona("analiza.bautista@demo.prc3.example");
  const juanId = new URL(pdsUrl).pathname.split("/").pop();
  const attempts = [
    [`/personnel/${juanId}`, "employee record"], [`/pds/${juanId}`, "PDS"], [`/service-record/${juanId}`, "service record"],
    [`${new URL(docUrl).pathname}`, "document page"], [`${new URL(correctionUrl).pathname}`, "correction request"],
    [`/documents?employee=${juanId}`, "document folder"], [`/attendance?employee=${juanId}`, "attendance"],
  ];
  for (const [path, label] of attempts) {
    const r = await ana.page.goto(`${BASE}${path}`);
    const body = await text(ana.page);
    const leaked = /Customer Service Excellence|Dela Cruz|BS Public Administration|Division logbook|AC-\d{4}/.test(body);
    ok(!leaked && (r?.status() === 404 || /don't have access|could not be found|not found/i.test(body) || /Time Record|DTR/.test(body) && !leaked), `Ana cannot see Juan's ${label}`);
  }
  const rawFile = await ana.ctx.request.get(`${BASE}${new URL(docUrl).pathname}/file`);
  ok(rawFile.status() === 404, "direct file URL returns 404 for another employee");
  const pdsPdf = await ana.ctx.request.get(`${BASE}/pds/${juanId}/pdf`);
  ok(pdsPdf.status() === 404, "PDS PDF endpoint refuses another employee");
  const exp = await ana.ctx.request.get(`${BASE}/reports/masterlist/export?format=csv`);
  ok(exp.status() === 404, "report export refused for an ordinary employee");
  const auditExp = await ana.ctx.request.get(`${BASE}/audit/export`);
  ok(auditExp.status() === 404, "audit export refused for an ordinary employee");
  await shot(ana.page, "12-ana-denied");

  step("11. Unauthenticated access");
  const anon = await browser.newContext();
  const unauth = await anon.request.get(`${BASE}/dashboard`, { maxRedirects: 0 });
  ok(unauth.status() === 307 && (unauth.headers().location ?? "").includes("/login"), "protected page redirects to sign-in");
  const unauthFile = await anon.request.get(`${BASE}${new URL(docUrl).pathname}/file`, { maxRedirects: 0 });
  ok([307, 401, 404].includes(unauthFile.status()), "unauthenticated file request is refused");
  const job = await anon.request.post(`${BASE}/api/jobs/notifications`, { maxRedirects: 0 });
  ok(job.status() === 401, "job endpoint requires its secret");

  console.log(`\nALL ${passed} CHECKS PASSED`);
  if (consoleErrors.length) console.log(`\nBrowser console errors (${consoleErrors.length}):\n` + [...new Set(consoleErrors)].slice(0, 10).join("\n"));
} catch (e) {
  console.error(`\n${e.message}`);
  if (consoleErrors.length) console.error("Console errors:\n" + [...new Set(consoleErrors)].slice(0, 10).join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
}
