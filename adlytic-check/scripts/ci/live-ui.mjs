// Live UI smoke against the production URL: renders the real page (real
// Turnstile, real fonts, real CSP) at 360/390/768/1440 and the legal pages,
// and fails on horizontal overflow, missing RTL/heading, or console errors
// coming from our own origin (CSP violations show up there). Never submits a
// check, so it spends nothing.
//   usage: node scripts/ci/live-ui.mjs <url> [out-dir]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const url = process.argv[2];
const out = process.argv[3] ?? "live-shots";
if (!url) throw new Error("usage: live-ui.mjs <url> [out-dir]");
const origin = new URL(url).origin;
mkdirSync(out, { recursive: true });

const failures = [];
const check = (name, ok) => {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (!ok) failures.push(name);
};

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
try {
  for (const w of [360, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 }, locale: "ar" });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      const at = m.location().url ?? "";
      if (m.type() === "error" && (at === "" || at.startsWith(origin))) errors.push(m.text());
    });
    await page.goto(url, { waitUntil: "load" });
    await page.waitForSelector("h1", { timeout: 15_000 });
    await page.waitForTimeout(1500);
    check(`${w}px: Arabic RTL page with the headline`, (await page.getAttribute("html", "dir")) === "rtl" && ((await page.textContent("h1")) ?? "").includes("خلّي إعلانك"));
    check(`${w}px: upload control present`, (await page.locator('input[type="file"]').count()) === 1);
    check(`${w}px: no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    check(`${w}px: display font loaded`, await page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/["']/g, "") === "Readex" && f.status === "loaded")));
    check(`${w}px: no console errors from our origin${errors.length ? ` (${errors.slice(0, 3).join(" | ")})` : ""}`, errors.length === 0);
    await page.screenshot({ path: `${out}/live-home-${w}.png`, fullPage: true });
    if (w === 390) {
      for (const [path, title] of [["/privacy", "الخصوصية"], ["/terms", "شروط الاستخدام"]]) {
        await page.goto(`${origin}${path}`, { waitUntil: "load" });
        await page.waitForSelector("h1", { timeout: 15_000 });
        check(`${path} renders`, ((await page.textContent("h1")) ?? "").includes(title));
        check(`${path}: no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
        await page.screenshot({ path: `${out}/live${path.replace("/", "-")}-${w}.png`, fullPage: true });
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
}
if (failures.length) {
  console.log(`::error title=Live UI smoke failed::${failures.join("; ")}`);
  process.exit(1);
}
console.log("live UI smoke passed");
