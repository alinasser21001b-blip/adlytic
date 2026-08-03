/**
 * The live preview — the running app, captured, at a link that never changes.
 *
 * @blueprint §3 · TD-1 · TD-2
 * @owner patient-app
 * @why The person this is being built for cannot open the dev server: it runs
 *      in a container they have no access to, and `localhost:5173` there is
 *      not `localhost:5173` here. Reporting that URL as a preview was wrong,
 *      and it was reported several times before anyone said so.
 *
 *      So this walks the RUNNING app the same way `smoke.mjs` does and writes
 *      one page from what it saw — screen by screen, with the port it actually
 *      answered on and what changed since the last capture. It is published to
 *      a stable address, so the link survives every update.
 *
 *      This is not hot reload and must not be called that: it is a capture,
 *      taken when a change is worth looking at.
 *
 * Usage: node tools/devserver/preview.mjs [--port 5173] [--note "what changed"]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const PORT = arg("port", process.env["PREVIEW_PORT"] ?? "5173");
const NOTE = arg("note", "");
const SCREEN = arg("screen", "");
const OUT = arg("out", "/tmp/preview");
const EXE = process.env["SMOKE_CHROMIUM"] ?? undefined;

mkdirSync(OUT, { recursive: true });

/** The port is the thing that silently changes: vite takes the next free one
 *  when 5173 is held, prints it, and every instruction that named 5173 is then
 *  wrong. So it is verified rather than assumed, and reported either way. */
const base = `http://localhost:${PORT}/`;
const reachable = await fetch(base).then((r) => r.ok).catch(() => false);
if (!reachable) {
  console.error(`the app does not answer on ${base} — start it with \`npm run dev\` and pass the port it prints`);
  process.exit(1);
}

const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

const shots = [];
const show = async (name, caption) => {
  const file = join(OUT, `${String(shots.length + 1).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file });
  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
  shots.push({ name, caption, file, text: text.slice(0, 180) });
};
const press = async (label) => {
  await page.getByLabel(label, { exact: true }).first().click();
  await page.waitForTimeout(250);
};
const type = async (value, index = 0) => {
  await page.locator("input").nth(index).fill(value);
  await page.waitForTimeout(400);
};

await page.goto(base, { waitUntil: "networkidle" });
await show("find", "البحث");
await type("بانادول");
await show("results", "النتائج");
await press("أضف بانادول للطلب");
await show("draft", "الطلب");
await press("كمّل");
await show("why-number", "ليش نحتاج رقمك");
await press("أدخل رقمي");
await type("07701234567");
await press("أرسل الرمز");
await type("123456");
await press("تأكيد");
await show("name", "الاسم");
await type("أم علي");
await press("كمّل");
await show("district", "المنطقة");
await press("اختر الكرادة");
await press("خلص");
await show("confirm", "التأكيد");
await press("أرسل الطلب");
await show("waiting", "الانتظار");
await page.waitForTimeout(6000);
await show("offers-waiting", "وصلت الردود");

await browser.close();

/** What changed — measured, not remembered. The previous capture's text is
 *  kept beside the images; a screen whose text differs is a screen that moved. */
const stateFile = join(OUT, "last.json");
const previous = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : {};
const changed = shots.filter((s) => previous[s.name] !== undefined && previous[s.name] !== s.text).map((s) => s.caption);
const added = shots.filter((s) => previous[s.name] === undefined).map((s) => s.caption);
writeFileSync(stateFile, JSON.stringify(Object.fromEntries(shots.map((s) => [s.name, s.text])), null, 1));

const b64 = (f) => "data:image/png;base64," + readFileSync(f).toString("base64");
const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);

const cards = shots.map((s) => `
    <figure class="s${changed.includes(s.caption) ? " moved" : ""}">
      <img src="${b64(s.file)}" alt="${s.caption}" width="390" height="844" loading="lazy" />
      <figcaption><b>${s.caption}</b>${changed.includes(s.caption) ? '<span class="chip">تغيّرت</span>' : ""}</figcaption>
    </figure>`).join("");

const status = errors.length
  ? `<p class="bad">أخطاء بالمتصفّح: ${errors.length} — ${errors[0]}</p>`
  : `<p class="good">ما أكو أخطاء بالمتصفّح. الرحلة مشت لآخرها.</p>`;

const html = `<title>دواء — المعاينة الحيّة</title>
<style>
:root{--surface:#0D1A15;--raised:#142720;--sunken:#1B2B22;--line:#1E3A2D;--ink:#F3F7F2;
 --muted:#9FC6B6;--subtle:#8FA89C;--accent:#2ECF9A;--warn:#E8B34B;--alert:#FF9C8A;}
@media (prefers-color-scheme:light){:root{--surface:#F7F4EE;--raised:#FFF;--sunken:#EDEAE2;
 --line:#DAD5CA;--ink:#16211D;--muted:#4E5C56;--subtle:#63726B;--accent:#2F5E12;--warn:#7A4E0A;--alert:#8C2F1F;}}
:root[data-theme="light"]{--surface:#F7F4EE;--raised:#FFF;--sunken:#EDEAE2;--line:#DAD5CA;
 --ink:#16211D;--muted:#4E5C56;--subtle:#63726B;--accent:#2F5E12;--warn:#7A4E0A;--alert:#8C2F1F;}
:root[data-theme="dark"]{--surface:#0D1A15;--raised:#142720;--sunken:#1B2B22;--line:#1E3A2D;
 --ink:#F3F7F2;--muted:#9FC6B6;--subtle:#8FA89C;--accent:#2ECF9A;--warn:#E8B34B;--alert:#FF9C8A;}
*{box-sizing:border-box}
body{margin:0;background:var(--surface);color:var(--ink);direction:rtl;text-align:right;
 font-family:"Noto Kufi Arabic","Segoe UI",system-ui,sans-serif;line-height:1.75;font-variant-numeric:tabular-nums;}
.w{max-width:1100px;margin:0 auto;padding:clamp(22px,4vw,48px) clamp(16px,3vw,32px);}
header{border-bottom:1px solid var(--line);padding-bottom:22px;}
.top{display:flex;flex-wrap:wrap;gap:10px;align-items:baseline;justify-content:space-between;}
h1{margin:0;font-size:clamp(1.5rem,4vw,2.1rem);font-weight:800;}
.stamp{color:var(--subtle);font-size:.85rem;}
.now{background:var(--raised);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-top:18px;}
.now dl{margin:0;display:grid;gap:6px 16px;grid-template-columns:auto 1fr;}
.now dt{color:var(--subtle);font-size:.85rem;}
.now dd{margin:0;font-weight:600;}
.good{color:var(--accent);margin:14px 0 0;font-size:.92rem;}
.bad{color:var(--alert);margin:14px 0 0;font-size:.92rem;}
code{background:var(--sunken);border:1px solid var(--line);border-radius:6px;padding:1px 7px;
 font-size:.85em;direction:ltr;display:inline-block;font-family:ui-monospace,monospace;}
.grid{display:grid;gap:22px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));margin-top:30px;}
figure{margin:0;display:flex;flex-direction:column;gap:10px;}
figure img{width:100%;height:auto;display:block;border-radius:12px;border:1px solid var(--line);background:var(--raised);}
.moved img{border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 35%,transparent);}
figcaption{font-size:.9rem;display:flex;align-items:center;gap:8px;}
.chip{font-size:.7rem;color:var(--accent);border:1px solid var(--accent);border-radius:999px;padding:1px 8px;}
footer{margin-top:38px;padding-top:18px;border-top:1px solid var(--line);color:var(--subtle);font-size:.87rem;}
</style>
<div class="w">
  <header>
    <div class="top"><h1>المعاينة الحيّة</h1><span class="stamp">آخر تحديث: ${stamp}</span></div>
    <div class="now">
      <dl>
        <dt>الشاشة اللي أشتغل عليها</dt><dd>${SCREEN || "الرحلة كاملة"}</dd>
        <dt>شنو تغيّر</dt><dd>${NOTE || (changed.length ? changed.join("، ") : "ما تغيّرت أي شاشة عن آخر لقطة")}</dd>
        <dt>شاشات تحرّكت</dt><dd>${changed.length ? changed.join("، ") : "ولا وحدة"}${added.length ? " · جديدة: " + added.join("، ") : ""}</dd>
        <dt>المنفذ</dt><dd><code>http://localhost:${PORT}</code> — على جهازي، مو على جهازك</dd>
      </dl>
      ${status}
    </div>
  </header>
  <div class="grid">${cards}
  </div>
  <footer>
    هذي لقطات من التطبيق وهو شغّال فعلاً، مو تصاميم. حتى تشغّله عندك:
    <code>npm ci</code> بعدين <code>npm run dev</code> داخل <code>platform</code>، وافتح العنوان اللي يطبعه —
    إذا المنفذ ${PORT} مشغول، vite ياخذ غيره ويطبعه.
  </footer>
</div>`;

const out = join(OUT, "preview.html");
writeFileSync(out, html, "utf8");
console.log(`preview → ${out}`);
console.log(`port ${PORT} · ${shots.length} screens · moved: ${changed.length ? changed.join(", ") : "none"}`);
console.log(`errors: ${errors.length ? errors.join(" | ") : "none"}`);
