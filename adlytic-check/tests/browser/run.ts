/**
 * Real-browser check against a real `wrangler dev` Worker + local D1, with the
 * provider and Turnstile replaced by the out-of-process test double.
 * Run: npm run test:browser   (screenshots land in tests/browser/out/)
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, webkit, type Browser, type Page } from "playwright";
import { MOCK, MOCK_PORT } from "../support/instances";
import { startMock } from "../support/mock-provider";

const PORT = 8811;
const BASE = `http://127.0.0.1:${PORT}`;
const ACC_PORT = 8812;
const ACC = `http://127.0.0.1:${ACC_PORT}`;
// BROWSER=webkit runs the same checks in WebKit (installed in CI; not in every sandbox).
const ENGINE = process.env.BROWSER === "webkit" ? "webkit" : "chromium";
const OUT = "tests/browser/out";
const FIXTURE = "tests/fixtures/example-ad.jpg";
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", process.env.CHROME_PATH].find((p) => p && existsSync(p));

// Like the real widget, reset() clears the token and issues a fresh one shortly after.
const TURNSTILE_STUB = `window.turnstile = {
  _o: null,
  render(el, o) { this._o = o; setTimeout(() => o.callback("ok-token"), 50); return "w1"; },
  reset() { const o = this._o; if (o) setTimeout(() => o.callback("ok-token-" + Date.now()), 300); },
  remove() {}
};`;

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}

async function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
}

/** An illustrative ad image owned by the project (rendered here, labelled as an example). */
async function makeFixture(browser: Browser) {
  if (existsSync(FIXTURE)) return;
  mkdirSync("tests/fixtures", { recursive: true });
  const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
  await page.setContent(`<html dir="rtl"><body style="margin:0;font-family:sans-serif">
    <div style="width:800px;height:800px;background:linear-gradient(160deg,#e9e1d3,#c9b79c);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px">
      <div style="width:520px;height:230px;background:#55624f;border-radius:40px 40px 18px 18px;box-shadow:0 30px 40px rgba(0,0,0,.25)"></div>
      <div style="font-size:64px;font-weight:800;color:#2b2a26">كنبة مخمل زيتوني</div>
      <div style="font-size:30px;color:#3e3b35">مثال توضيحي — ليس إعلاناً حقيقياً</div>
    </div></body></html>`);
  await page.screenshot({ path: FIXTURE, type: "jpeg", quality: 88 });
  await page.close();
}

async function main() {
  const env = { ...process.env, WRANGLER_SEND_METRICS: "false" };
  mkdirSync(OUT, { recursive: true });
  if (!existsSync("dist/index.html")) spawnSync("npx", ["vite", "build"], { stdio: "inherit", env });
  const mock = await startMock(MOCK_PORT);
  const dir = mkdtempSync(join(tmpdir(), "ac-browser-"));
  spawnSync("npx", ["wrangler", "d1", "migrations", "apply", "adlytic-check-db", "--local", "--persist-to", dir], { env });
  const vars = {
    ENVIRONMENT: "development", ANTHROPIC_API_KEY: "test-key-not-real", PROVIDER_BASE_URL: MOCK,
    TURNSTILE_SECRET_KEY: "test", TURNSTILE_SITE_KEY: "1x00000000000000000000AA", TURNSTILE_VERIFY_URL: `${MOCK}/siteverify`,
    IP_HASH_SECRET: "t", BUILD_ID: "browser-test",
  };
  const wr = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1", "--persist-to", dir, "--inspector-port", "9399", "--show-interactive-dev-session=false", ...Object.entries(vars).flatMap(([k, v]) => ["--var", `${k}:${v}`])], { env, stdio: "ignore", detached: true });
  // Second Worker: Analyzer V2 + Google accounts (fake IdP) + ZainCash (fake gateway).
  const accDir = mkdtempSync(join(tmpdir(), "ac-browser-acc-"));
  spawnSync("npx", ["wrangler", "d1", "migrations", "apply", "adlytic-check-db", "--local", "--persist-to", accDir], { env });
  const accVars = {
    ...vars, ANALYZER_VERSION: "v2", ACCOUNTS_ENABLED: "true", GOOGLE_CLIENT_ID: "test-google-client", GOOGLE_CLIENT_SECRET: "test-google-secret",
    GOOGLE_AUTH_URL: `${MOCK}/o/oauth2/v2/auth`, GOOGLE_TOKEN_URL: `${MOCK}/token`, PAYMENTS_ENABLED: "true", ZAINCASH_CLIENT_ID: "zc-client",
    ZAINCASH_CLIENT_SECRET: "zc-secret", ZAINCASH_BASE_URL: `${MOCK}/zc`, MAX_SESSIONS_PER_IP_HOUR: "1000",
  };
  const acc = spawn("npx", ["wrangler", "dev", "--port", String(ACC_PORT), "--ip", "127.0.0.1", "--persist-to", accDir, "--inspector-port", "9398", "--show-interactive-dev-session=false", ...Object.entries(accVars).flatMap(([k, v]) => ["--var", `${k}:${v}`])], { env, stdio: "ignore", detached: true });
  for (const base of [BASE, ACC]) {
    for (let i = 0; i < 120; i++) {
      try {
        if ((await fetch(`${base}/api/health`)).ok) break;
      } catch { /* booting */ }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const browser = ENGINE === "webkit" ? await webkit.launch() : await chromium.launch({ executablePath: CHROME });
  console.log(`engine: ${ENGINE}`);
  try {
    await makeFixture(browser);
    for (const w of [360, 390, 768, 1440]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: "ar" });
      const page = await ctx.newPage();
      await page.goto(BASE, { waitUntil: "networkidle" });
      check(`no horizontal overflow at ${w}px (home)`, await noHorizontalOverflow(page));
      await ctx.close();
    }
    await accountJourney(browser, 390);
    await accountJourney(browser, 1440);
    for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]] as const) {
      console.log(`\n── ${w}×${h}`);
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: "ar", ...(ENGINE === "chromium" ? { permissions: ["clipboard-read", "clipboard-write"] } : {}) });
      await ctx.route("https://challenges.cloudflare.com/**", (r) => r.fulfill({ contentType: "text/javascript", body: TURNSTILE_STUB }));
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

      await page.goto(BASE, { waitUntil: "networkidle" });
      check("home renders Arabic RTL", (await page.getAttribute("html", "dir")) === "rtl" && (await page.textContent("h1"))!.includes("خلّي إعلانك"));
      check("no horizontal overflow (home)", await noHorizontalOverflow(page));
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/home-${w}.png`, fullPage: true });

      if (w === 390) {
        await page.setInputFiles('input[type="file"]', { name: "IMG_0001.HEIC", mimeType: "image/heic", buffer: Buffer.from("....ftypheic....") });
        check("HEIC is refused with a phone-friendly message", (await page.textContent(".inline-error"))?.includes("لقطة شاشة") ?? false);
      }

      await page.setInputFiles('input[type="file"]', FIXTURE);
      await page.waitForSelector(".preview img");
      check("image preview shown", await page.isVisible(".preview img"));
      await page.click("text=إزالة الصورة");
      check("remove clears the preview", (await page.$(".preview img")) === null);
      await page.setInputFiles('input[type="file"]', FIXTURE);
      await page.waitForSelector(".preview img");

      await page.fill("textarea", "كنبة مخمل زيتوني مريحة، متوفرة بأكثر من لون. راسلنا.");
      await page.selectOption("select", "furniture");
      await page.click('label:has-text("طلبات شراء")');
      await page.waitForFunction(() => !(document.querySelector('button[type="submit"]') as HTMLButtonElement).disabled);
      await page.click('button[type="submit"]');
      await page.waitForSelector("#result-title", { timeout: 30_000 });
      check("result shows perceived message", (await page.textContent(".perceived"))!.length > 5);
      check("URL moved to the private report", /\/r\/[A-Za-z0-9_-]+$/.test(page.url()));
      check("post preview carries the uploaded image", await page.isVisible(".post img"));
      check("four axes rendered", (await page.$$(".axis")).length === 4);
      check("no horizontal overflow (result)", await noHorizontalOverflow(page));
      await page.waitForTimeout(600); // let the entrance animation settle before capturing
      await page.screenshot({ path: `${OUT}/result-${w}.png`, fullPage: true });

      await page.click("text=انسخ النص المحسّن");
      await page.waitForTimeout(200);
      if (ENGINE === "chromium") {
        const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
        check("copy puts the improved copy on the clipboard", clip.includes("كنبة مخمل"));
      } else {
        check("copy reports its outcome", ((await page.textContent(".status")) ?? "").length >= 0);
      }

      await page.click("text=أنشئ رابط المشاركة");
      await page.waitForSelector("#share-url");
      const shareUrl = await page.inputValue("#share-url");
      check("share link created", shareUrl.startsWith(`${BASE}/s/`));
      const pub = await browser.newPage();
      await pub.goto(shareUrl);
      const pubText = (await pub.textContent("body")) ?? "";
      check("share page opens in a fresh session without the ad text", pubText.includes("راجعنا وضوح") && !pubText.includes("زيتوني"));
      if (w === 390) await pub.screenshot({ path: `${OUT}/share-390.png`, fullPage: true });
      await pub.close();

      await page.reload({ waitUntil: "networkidle" });
      check("private report reloads from the server for its owner", await page.isVisible("#result-title"));

      await page.click("text=افحص إعلاناً آخر");
      await page.waitForSelector("#check");
      check("new check returns to an empty form", (await page.inputValue("textarea")) === "");
      check("no console or page errors", errors.length === 0, errors.join(" | "));
      await ctx.close();
    }
  } finally {
    await browser.close();
    for (const p of [wr, acc]) {
      try {
        if (p.pid) process.kill(-p.pid, "SIGTERM");
      } catch { p.kill(); }
    }
    rmSync(accDir, { recursive: true, force: true });
    mock.server.closeAllConnections();
    mock.server.close();
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(failures ? `\n✗ ${failures} browser check(s) failed` : "\n✓ all browser checks passed");
  process.exit(failures ? 1 : 0);
}

/** Sign in (fake Google) → V2 report → free units used → buy a bundle (fake ZainCash) → paid check with consent. */
async function accountJourney(browser: Browser, w: number) {
  console.log(`\n── accounts + V2 + payments at ${w}px`);
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: "ar" });
  await ctx.route("https://challenges.cloudflare.com/**", (r) => r.fulfill({ contentType: "text/javascript", body: TURNSTILE_STUB }));
  // Each journey is a different Google account (redirect hops cannot be routed, so tell the fake IdP).
  await fetch(`${MOCK}/__idp/next-sub`, { method: "POST", body: `browser-${ENGINE}-${w}-${Date.now()}` });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // 401/402/409/429 are expected answers in this journey (login, quota, consent); browsers log them as errors.
  page.on("console", (m) => m.type() === "error" && !/status of (401|402|409|429)/.test(m.text()) && errors.push(m.text()));

  await page.goto(ACC, { waitUntil: "networkidle" });
  check("login callout shown and checks disabled before sign-in", (await page.isVisible(".login-callout")) && (await page.isDisabled('button[type="submit"]')));
  await page.click('.login-callout a:has-text("تسجيل الدخول")');
  await page.waitForURL(`${ACC}/`);
  await page.waitForSelector(".balance-chip");
  await page.waitForFunction(() => /\d/.test(document.querySelector(".balance-chip")?.textContent ?? ""));
  const chip = (await page.textContent(".balance-chip")) ?? "";
  check("signed in with 2 free checks", chip.includes("2"), chip);

  async function runCheck(text: string, withImage: boolean) {
    if (withImage) {
      await page.setInputFiles('input[type="file"]', FIXTURE);
      await page.waitForSelector(".preview img");
    }
    await page.fill("textarea", text);
    await page.selectOption("select", "furniture");
    await page.waitForFunction(() => !(document.querySelector('button[type="submit"]') as HTMLButtonElement).disabled);
    await page.click('button[type="submit"]');
  }

  await runCheck("كنبة مخمل زيتوني مريحة. راسلنا على الخاص.", true);
  await page.waitForSelector(".result.v2", { timeout: 30_000 });
  const order = await page.$$eval(".result.v2 > section, .result.v2 > header", (els) => els.map((e) => e.querySelector("h2,h3")?.id ?? ""));
  check("V2 sections in the required order", ["result-title", "first-fix", "steps", "copy-title", "why-title", "checked-title", "share-title"].every((id, i, a) => i === 0 || order.indexOf(id) > order.indexOf(a[i - 1]!)), order.join(","));
  check("top fix carries its evidence", (await page.$$(".first-fix .evidence li")).length > 0);
  check("index hidden while unproven", (await page.$(".index")) === null);
  check("before / after copy shown", (await page.isVisible(".ba.before")) && (await page.isVisible(".ba.after")));
  check("sources listed from the registry", (await page.$$eval(".sources li", (l) => l.length)) > 0);
  check("no horizontal overflow (V2 result)", await noHorizontalOverflow(page));
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/v2-result-${ENGINE}-${w}.png`, fullPage: true });

  await page.click("text=افحص إعلاناً آخر");
  await page.waitForSelector("#check");
  await runCheck("طاولة طعام خشب. اطلب بالخاص.", false);
  await page.waitForSelector(".result.v2", { timeout: 30_000 });
  await page.click("text=افحص إعلاناً آخر");
  await page.waitForSelector("#check");
  await runCheck("كرسي مكتب مريح.", false);
  await page.waitForSelector(".form-error .buy", { timeout: 15_000 });
  check("free units used up → bundles offered (single check withheld with reason)", (await page.$$(".bundle")).length === 2 && ((await page.textContent(".buy")) ?? "").includes("رسوم"));
  await page.screenshot({ path: `${OUT}/v2-buy-${ENGINE}-${w}.png`, fullPage: false });
  await page.click('.bundle:has-text("2,500")');
  await page.waitForURL(/payment=success/, { timeout: 20_000 });
  await page.waitForSelector(".banner.success");
  await page.waitForFunction(() => (document.querySelector(".balance-chip")?.textContent ?? "").includes("5"));
  check("payment confirmed by the server and 5 paid checks added", true);

  await runCheck("كرسي مكتب مريح.", false);
  await page.waitForSelector('.form-error button:has-text("فحصاً مدفوعاً")', { timeout: 15_000 });
  check("paid unit needs explicit consent showing the price", ((await page.textContent(".form-error")) ?? "").includes("500"));
  const checkResponses: number[] = [];
  page.on("response", (r) => r.url().endsWith("/api/check") && checkResponses.push(r.status()));
  await page.click('.form-error button:has-text("فحصاً مدفوعاً")');
  try {
    await page.waitForSelector(".result.v2", { timeout: 30_000 });
  } catch (e) {
    await page.screenshot({ path: `${OUT}/v2-consent-failure-${ENGINE}-${w}.png`, fullPage: true });
    console.log("consent debug:", checkResponses, (await page.textContent(".form-error").catch(() => "")) ?? "");
    throw e;
  }
  await page.waitForFunction(() => (document.querySelector(".balance-chip")?.textContent ?? "").includes("4"));
  check("consented paid check spends exactly one unit", true);
  check("no console or page errors (accounts)", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

void main();
