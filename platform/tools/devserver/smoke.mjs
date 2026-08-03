/**
 * Walk the running app in a real browser.
 *
 * Not a gate and not a test — `npm run check` owns those, and this asserts
 * nothing. It exists because the E4 defect was invisible to every suite in the
 * repository and took ten seconds to find by pressing a button: it prints what
 * a patient would see, screen by screen, plus any console error the page
 * raised, so "it runs" can be a statement rather than a hope.
 *
 * Run the dev server first (`npm run dev`), then `node tools/devserver/smoke.mjs`.
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const URL = process.env["SMOKE_URL"] ?? "http://localhost:5173/apps/patient/web/index.html";
const SHOTS = process.env["SMOKE_SHOTS"] ?? null;

/** The environment pins a Chromium that may not match the version this
 *  playwright build looks for. `SMOKE_CHROMIUM` points at it when it does not. */
const executablePath = process.env["SMOKE_CHROMIUM"] ?? undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(URL, { waitUntil: "networkidle" });

let step = 0;
const show = async (what) => {
  step += 1;
  const text = (await page.locator("#root").innerText()).replace(/\s+/g, " ").trim();
  console.log(`${String(step).padStart(2)} ${what.padEnd(12)}: ${text.slice(0, 180)}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${String(step).padStart(2, "0")}-${what}.png` });
};

const press = async (label) => {
  const control = page.getByLabel(label, { exact: true }).first();
  await control.click();
  await page.waitForTimeout(200);
};

const type = async (value, index = 0) => {
  await page.locator("input").nth(index).fill(value);
  await page.waitForTimeout(400);
};

await show("open");
await type("بانادول");
await show("results");
await press("أضف بانادول للطلب");
await show("draft");
await press("كمّل");
await show("why-number");
await press("أدخل رقمي");
await show("phone");
await type("07701234567");
await press("أرسل الرمز");
await show("code");
await type("123456");
await press("تأكيد");
await show("confirm");
await press("أرسل الطلب");
await show("waiting");

// The dev server answers on a timer, the way pharmacies do — the wait is the
// point of R7 and skipping it would be testing a screen nobody sees.
await page.waitForTimeout(8_000);
await show("waited");

console.log(`\nERRORS: ${errors.length === 0 ? "none" : ""}`);
for (const e of errors) console.log(`  ${e}`);
if (SHOTS) writeFileSync(`${SHOTS}/errors.txt`, errors.join("\n"));

await browser.close();
