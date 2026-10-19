/**
 * Real-browser check against a real `wrangler dev` Worker + local D1, with the
 * provider and Turnstile replaced by the out-of-process test double.
 * Run: npm run test:browser   (screenshots land in tests/browser/out/)
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { MOCK, MOCK_PORT } from "../support/instances";
import { startMock } from "../support/mock-provider";

const PORT = 8811;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "tests/browser/out";
const FIXTURE = "tests/fixtures/example-ad.jpg";
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", process.env.CHROME_PATH].find((p) => p && existsSync(p));

const TURNSTILE_STUB = `window.turnstile = {
  render(el, o) { setTimeout(() => o.callback("ok-token"), 50); return "w1"; },
  reset() {}, remove() {}
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
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) break;
    } catch { /* booting */ }
    await new Promise((r) => setTimeout(r, 500));
  }

  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    await makeFixture(browser);
    for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]] as const) {
      console.log(`\n── ${w}×${h}`);
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: "ar", permissions: ["clipboard-read", "clipboard-write"] });
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
      const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
      check("copy puts the improved copy on the clipboard", clip.includes("كنبة مخمل"));

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
    try {
      if (wr.pid) process.kill(-wr.pid, "SIGTERM");
    } catch { wr.kill(); }
    mock.server.closeAllConnections();
    mock.server.close();
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(failures ? `\n✗ ${failures} browser check(s) failed` : "\n✓ all browser checks passed");
  process.exit(failures ? 1 : 0);
}

void main();
