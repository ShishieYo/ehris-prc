// When the data API is down, users must see a friendly message, never technical details. Run LAST: it kills PostgREST.
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const PASSWORD = process.env.E2E_PASSWORD ?? "E2e-Demo-Password-2026";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const page = await (await browser.newContext()).newPage();
let failed = false;
const ok = (c, m) => { console.log(`${c ? "  ok " : "FAIL"} ${m}`); if (!c) failed = true; };

await page.goto(`${BASE}/login`);
await page.getByLabel("Email address").fill("juan.delacruz@demo.prc3.example");
await page.getByLabel("Password").fill(PASSWORD);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL(/\/(dashboard|privacy)/);
await page.waitForLoadState("networkidle");
if (page.url().includes("privacy")) {
  await page.getByLabel(/I have read this notice/).check();
  await page.getByRole("button", { name: "Acknowledge and continue" }).click();
  await page.waitForURL(/dashboard/);
}

execSync("pkill -x postgrest || true");
await new Promise((r) => setTimeout(r, 1000));
const res = await page.goto(`${BASE}/leave`);
await page.locator("h1").first().waitFor();
const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
ok(/We couldn't complete this request/.test(body), "a backend outage shows the friendly message");
ok(!/PostgrestError|ECONNREFUSED|fetch failed|relation .* does not exist|stack|at .*\.tsx?:\d+/i.test(body), "no technical details are shown");
ok(res.status() < 600, `server answered (${res.status()})`);
await browser.close();
process.exit(failed ? 1 : 0);
