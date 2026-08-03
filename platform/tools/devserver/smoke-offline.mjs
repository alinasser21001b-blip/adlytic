/**
 * The unhappy paths, walked in a real browser.
 *
 * Not a gate — `npm run check` owns those. This exists because every defect
 * found so far was found by pressing a button rather than by reading, and the
 * failure states are the ones nobody has ever seen on a platform: the offline
 * treatments, the wrong code, the withdrawn offer. Blueprint v3 declares all
 * of them and the suite renders them from fixtures; none had been reached by
 * actually breaking something mid-journey.
 *
 * Run the dev server first (`npm run dev`), then
 * `node tools/devserver/smoke-offline.mjs`.
 */
import { chromium } from "playwright";

const URL = process.env["SMOKE_URL"] ?? "http://localhost:5173/apps/patient/web/index.html";
const executablePath = process.env["SMOKE_CHROMIUM"] ?? undefined;

const browser = await chromium.launch(executablePath ? { executablePath } : {});

/**
 * Uncaught exceptions only.
 *
 * This script deliberately breaks the network and deliberately sends a wrong
 * code, so `Failed to load resource: ERR_INTERNET_DISCONNECTED` and a 400 are
 * the POINT of the run rather than defects in it. Counting them as errors —
 * which the first version did — would train a reader to ignore the one line
 * that matters. A thrown exception is never expected here.
 */
const errors = [];

async function open() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(URL, { waitUntil: "networkidle" });

  const said = async () => (await page.locator("#root").innerText()).replace(/\s+/g, " ").trim();
  const show = async (what) => console.log(`  ${what.padEnd(22)}: ${(await said()).slice(0, 150)}`);
  const press = async (label) => {
    await page.getByLabel(label, { exact: true }).first().click();
    await page.waitForTimeout(250);
  };
  const type = async (v, i = 0) => {
    await page.locator("input").nth(i).fill(v);
    await page.waitForTimeout(400);
  };
  const has = async (label) => (await page.locator(`[aria-label="${label}"]`).count()) > 0;

  return { page, context, said, show, press, type, has };
}

/* ── 1. Searching with no connection ──────────────────────────────────── */
{
  console.log("\nF2 offline — a search with no network");
  const a = await open();
  await a.type("بانادول");
  await a.show("first search, online");

  await a.context.setOffline(true);
  await a.page.evaluate(() => globalThis.dispatchEvent(new Event("offline")));
  await a.type("بانادول اكسترا");
  await a.page.waitForTimeout(600);
  await a.show("second search, offline");

  // The same query again: this one IS in the cache, so F2's offline promise —
  // cached rows, labelled with their age — is the declared treatment.
  await a.type("بانادول");
  await a.page.waitForTimeout(600);
  await a.show("cached query, offline");
  await a.context.close();
}

/* ── 2. Losing the connection with a request half-built ───────────────── */
{
  console.log("\nE5 offline — the one screen that cannot work without a network");
  const b = await open();
  await b.type("بانادول");
  await b.press("أضف بانادول للطلب");
  await b.press("كمّل");
  await b.press("أدخل رقمي");

  await b.context.setOffline(true);
  await b.page.evaluate(() => globalThis.dispatchEvent(new Event("offline")));
  await b.type("07701234567");
  await b.page.waitForTimeout(400);
  await b.show("phone entry, offline");
  console.log(`  submit enabled?        : ${await b.page.locator('[aria-label="أرسل الرمز"]').isEnabled()}`);
  await b.context.close();
}

/* ── 3. A wrong code, then an exhausted one ───────────────────────────── */
{
  console.log("\nE6 — a wrong code says how many tries are left");
  const c = await open();
  await c.type("بانادول");
  await c.press("أضف بانادول للطلب");
  await c.press("كمّل");
  await c.press("أدخل رقمي");
  await c.type("07701234567");
  await c.press("أرسل الرمز");

  for (let i = 1; i <= 5; i += 1) {
    await c.type("000000");
    await c.press("تأكيد");
    await c.page.waitForTimeout(250);
    await c.show(`wrong code ${i}`);
  }
  console.log(`  resend offered?        : ${await c.has("أرسل رمز جديد")}`);
  await c.context.close();
}

/* ── 4. Sending a request with no connection (D27) ────────────────────── */
{
  console.log("\nD27 — a queued request is never presented as sent");
  const d = await open();
  await d.type("بانادول");
  await d.press("أضف بانادول للطلب");
  await d.press("كمّل");
  await d.press("أدخل رقمي");
  await d.type("07701234567");
  await d.press("أرسل الرمز");
  await d.type("123456");
  await d.press("تأكيد");
  await d.show("confirm, online");

  await d.context.setOffline(true);
  await d.page.evaluate(() => globalThis.dispatchEvent(new Event("offline")));
  await d.page.waitForTimeout(300);
  await d.show("confirm, offline");
  await d.press("أرسل الطلب");
  await d.page.waitForTimeout(800);
  await d.show("after send, offline");
  await d.context.close();
}

console.log(`\nERRORS: ${errors.length === 0 ? "none" : ""}`);
for (const e of errors) console.log(`  ${e}`);

await browser.close();
