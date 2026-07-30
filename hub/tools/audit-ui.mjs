/* ============================================================
   QAREEB — FULL END-TO-END UI/UX AUDIT
   ============================================================
   Run:  python3 -m http.server 8899     (from hub/)
         node tools/audit-ui.mjs

   Needs Playwright and a Chromium, so it is deliberately NOT part
   of `npm test` — that suite stays dependency-free and runs
   anywhere.

   Every route x two languages x two themes x two phone widths,
   measured in a real browser. Nothing here reads the source and
   concludes; everything is a measurement of what rendered.

   WHY THE DETECTORS ARE SHAPED THIS WAY. A detector that cannot
   fail is decoration, so each one was pointed at the commit before
   the fixes and had to report the defect already known to be
   there. The first dead-end check counted any `a[href^="#/"]` on
   the page and so reported zero on a build with sixteen navless
   routes; it was replaced with the tab-bar and height-reservation
   checks, which do fail on it. Against 64f325b this file reports
   179 findings; against the build that followed, 0.

   The touch check skips disabled controls and measures an input
   through its wrapping <label>, because that is what a thumb
   actually hits — otherwise it reports failures nobody meets.
   ============================================================ */
/* A dev dependency, not a shipped one: the client app still has no
   dependencies and no build step. Fail with a sentence rather than a
   module-resolution stack trace, because the fix is one command. */
let chromium;
try { ({ chromium } = await import("playwright")); }
catch {
  console.error("audit-ui needs Playwright:  npm i    (then re-run)");
  console.error("A Chromium is expected at PLAYWRIGHT_BROWSERS_PATH or the path in CHROME below.");
  process.exit(2);
}
import { writeFileSync } from "node:fs";
/* shared seed used by every agent-5 probe */
const B = process.env.QAREEB_BASE || "http://127.0.0.1:8899";
const ROUTES = [
  "#/", "#/record", "#/record/conditions", "#/record/medications", "#/record/allergies",
  "#/record/labs", "#/record/documents", "#/record/timeline", "#/record/shares",
  "#/record/access", "#/record/carry", "#/record/profile", "#/record/share",
  "#/record/add/allergy", "#/record/add/medication", "#/record/add/condition",
  "#/record/add/document", "#/needs", "#/doctors",
  "#/doctor/d1", "#/pharmacies", "#/pharmacy/p1", "#/explorer", "#/rx", "#/me",
  "#/trust", "#/need/new", "#/lab", "#/imaging", "#/pharmacy-rx", "#/clinical/PAT-X",
];

const SEED = () => {
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem("qrb.qareeb.record.v1", JSON.stringify({
    patient: { id: "PAT-X", nameParts: { given: "زينب", father: "كاظم", grandfather: "عبدالله" },
      birthDate: "1986-11-02", sex: "female", identifiers: [], registeredAt: today },
    allergies: [{ id: "A1", substance: "البنسلين", reaction: "طفح جلدي", criticality: "high" }],
    conditions: [{ id: "C1", display: "داء السكري النوع ٢", clinicalStatus: "active", chronic: true,
      onsetDate: "2025-02-09", lastReviewed: "2026-06-20" },
      { id: "C2", display: "ارتفاع ضغط الدم", clinicalStatus: "active", chronic: true,
        onsetDate: "2024-05-01", lastReviewed: "2026-07-01" }],
    medications: [{ id: "M1", display: "ميتفورمين", dose: "٥٠٠ ملغم", frequency: "BID",
      indication: "داء السكري النوع ٢", status: "active", startDate: "2025-02-09", lastConfirmed: "2026-06-20" },
      { id: "M2", display: "أملوديبين", dose: "٥ ملغم", frequency: "OD", indication: "ارتفاع ضغط",
        status: "active", startDate: "2024-05-01", lastConfirmed: "2026-07-01" }],
    results: [{ id: "R1", code: "HbA1c", display: "الخضاب السكري", value: 7.1, unit: "%",
      refLow: 4, refHigh: 5.6, effectiveAt: "2025-08-03", performerId: "L1", acknowledgedBy: "DR1" },
      { id: "R2", code: "HbA1c", display: "الخضاب السكري", value: 8.4, unit: "%",
        refLow: 4, refHigh: 5.6, effectiveAt: "2026-07-01", performerId: "L1" }],
    encounters: [{ id: "E1", startedAt: "2026-05-11", clinicianId: "DR-2", clinicianName: "د. سهى",
      chiefComplaint: "متابعة سكري", assessment: "سكري مضبوط جزئياً", state: "signed" }],
    documents: [], immunizations: [], prescriptions: [], procedures: [], studies: [], orders: [],
    episodes: [], tasks: [{ id: "T1", kind: "result-acknowledgement", status: "open",
      dueAt: "2026-07-10", about: "الخضاب السكري" }],
    appointments: [], shares: [], accessLog: [], requests: [], referrals: [], dispenses: [], outbox: [],
  }));
};

const CHROME = process.env.QAREEB_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const WIDTHS = [390, 360];
const fail = { render: [], touch: [], overflow: [], contrast: [], rtl: [], deadend: [], clip: [], focus: [], motion: [], ltrun: [] };
const note = (bucket, s) => fail[bucket].push(s);

/* ---------- contrast maths, WCAG 2.1 ---------- */
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number);
const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const b = await chromium.launch({ executablePath: CHROME });

/* ============ 1 · EVERY ROUTE RENDERS, BOTH LANGUAGES, BOTH THEMES ============ */
console.log("── ١ · كل شاشة ترسم — every route renders");
for (const lang of ["ar", "en"]) {
  for (const theme of ["dark", "light"]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const pg = await ctx.newPage();
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
    await pg.goto(B + "/index.html", { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(400);
    await pg.evaluate(SEED);
    await pg.evaluate(([l, t]) => {
      localStorage.setItem("qrb.lang", JSON.stringify(l));
      localStorage.setItem("qrb.theme", JSON.stringify(t));
    }, [lang, theme]);
    let bad = 0;
    for (const r of ROUTES) {
      errs.length = 0;
      await pg.goto(B + "/index.html" + r, { waitUntil: "domcontentloaded" });
      await pg.waitForTimeout(430);
      const v = await pg.evaluate(() => {
        const app = document.getElementById("app");
        return { len: (app ? app.innerHTML : "").length,
                 text: (document.body.innerText || "").trim().length };
      });
      if (v.len < 200 || v.text < 10) { note("render", `${lang}/${theme} ${r} — ${v.len} bytes, ${v.text} chars`); bad++; }
      if (errs.length) { note("render", `${lang}/${theme} ${r} — ${errs[0]}`); bad++; }
    }
    console.log(`   ${lang}/${theme}: ${ROUTES.length - bad}/${ROUTES.length}`);
    await ctx.close();
  }
}

/* ============ 2 · TOUCH TARGETS + OVERFLOW, BOTH WIDTHS ============ */
console.log("\n── ٢ · أهداف اللمس والفيضان — targets and overflow");
const MEASURE = () => {
  const out = [];
  for (const el of document.querySelectorAll("a,button,input,select,textarea,[role=button],[onclick]")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
    if (el.disabled) continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    /* an input inside a <label> is tapped through the label */
    if (el.tagName === "INPUT") {
      const l = el.closest("label");
      if (l) { const lr = l.getBoundingClientRect(); if (lr.width >= 44 && lr.height >= 44) continue; }
    }
    if (r.width >= 44 && r.height >= 44) continue;
    out.push({ txt: (el.getAttribute("aria-label") || el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 26)
                 || "(" + (el.className || el.tagName) + ")",
               w: +r.width.toFixed(1), h: +r.height.toFixed(1) });
  }
  return out;
};
for (const width of WIDTHS) {
  const ctx = await b.newContext({ viewport: { width, height: 844 } });
  const pg = await ctx.newPage();
  await pg.goto(B + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(400); await pg.evaluate(SEED);
  let small = 0, over = 0;
  for (const r of ROUTES) {
    await pg.goto(B + "/index.html" + r, { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(430);
    for (const s of await pg.evaluate(MEASURE)) { note("touch", `${width}px ${r} — "${s.txt}" ${s.w}×${s.h}`); small++; }
    const ov = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if (ov.sw > ov.cw) { note("overflow", `${width}px ${r} — scrolls ${ov.sw - ov.cw}px sideways`); over++; }
  }
  console.log(`   ${width}px: ${small} targets under 44, ${over} routes overflowing`);
  await ctx.close();
}

/* ============ 3 · CONTRAST, BOTH THEMES ============ */
console.log("\n── ٣ · التباين — text contrast (WCAG 1.4.3)");
for (const theme of ["dark", "light"]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  await pg.goto(B + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(400); await pg.evaluate(SEED);
  await pg.evaluate((t) => localStorage.setItem("qrb.theme", JSON.stringify(t)), theme);
  let worst = { r: 99, what: "" }, bad = 0;
  for (const r of ROUTES) {
    await pg.goto(B + "/index.html" + r, { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(430);
    const rows = await pg.evaluate(() => {
      const out = [];
      const bgOf = (el) => {
        for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
          const c = getComputedStyle(n).backgroundColor;
          if (c && c !== "rgba(0, 0, 0, 0)" && !/, *0\)$/.test(c)) return c;
        }
        return getComputedStyle(document.body).backgroundColor;
      };
      for (const el of document.querySelectorAll("*")) {
        if (el.children.length) continue;
        const t = (el.textContent || "").trim();
        if (!t) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        out.push({ t: t.slice(0, 24), fg: cs.color, bg: bgOf(el),
                   size: parseFloat(cs.fontSize), weight: +cs.fontWeight || 400,
                   cls: (el.className || "").toString().slice(0, 20) });
      }
      return out;
    });
    for (const x of rows) {
      const fg = parse(x.fg), bg = parse(x.bg);
      if (fg.length < 3 || bg.length < 3) continue;
      /* the element's own alpha composited onto its background */
      const a = fg.length > 3 ? fg[3] : 1;
      const eff = a < 1 ? fg.slice(0, 3).map((c, i) => c * a + bg[i] * (1 - a)) : fg.slice(0, 3);
      const rr = ratio(eff, bg.slice(0, 3));
      /* 1.4.3: 3:1 for large text (>=18.66px bold, or >=24px), else 4.5:1 */
      const large = x.size >= 24 || (x.size >= 18.66 && x.weight >= 700);
      const need = large ? 3 : 4.5;
      if (rr < worst.r) worst = { r: rr, what: `${theme} ${r} "${x.t}" .${x.cls}` };
      if (rr < need) { note("contrast", `${theme} ${r} — "${x.t}" .${x.cls} ${rr.toFixed(2)}:1 (needs ${need})`); bad++; }
    }
  }
  console.log(`   ${theme}: ${bad} below threshold, worst ${worst.r.toFixed(2)}:1 — ${worst.what}`);
  await ctx.close();
}

/* ---------- ٣-ب · the boundary of a CONTROL, WCAG 1.4.11 ----------
   This detector did not exist, and its absence let a real failure ship for the
   life of the project: every chip outline, field outline, icon button and
   monogram ring in the dark theme was drawn at 1.43:1 against its own surface,
   against a 3:1 requirement. Text contrast was measured from the beginning;
   the edge of the thing you tap was not measured at all. A flat, unfinished
   look was the symptom — the cause was arithmetic nobody had checked. */
console.log("\n── ٣-ب · حدود عناصر التحكّم — control boundaries (WCAG 1.4.11)");
for (const theme of ["dark", "light"]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  await pg.goto(B + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(400); await pg.evaluate(SEED);
  await pg.evaluate((t) => localStorage.setItem("qrb.theme", JSON.stringify(t)), theme);
  let worst = { r: 99, what: "" }, bad = 0, seen = 0;
  for (const r of ROUTES) {
    await pg.goto(B + "/index.html" + r, { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(430);
    const rows = await pg.evaluate(() => {
      const out = [];
      const bgOf = (el) => {
        for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
          const c = getComputedStyle(n).backgroundColor;
          if (c && c !== "rgba(0, 0, 0, 0)" && !/, *0\)$/.test(c)) return c;
        }
        return getComputedStyle(document.body).backgroundColor;
      };
      /* Only things a person can operate: the boundary of a decorative panel
         is not what 1.4.11 is about, and holding it to 3:1 would force a
         heavier line than the design wants for a surface nobody touches. */
      for (const el of document.querySelectorAll(
        "button, a[href], input, select, textarea, label.rw, .chip, .icon-btn, .btn")) {
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
        if (el.disabled) continue;
        const box = el.getBoundingClientRect();
        if (box.width < 8 || box.height < 8) continue;
        /* A BOX, not a separator. `.stack > * + * { border-top }` draws a
           hairline BETWEEN sibling rows, and a row's identity comes from its
           content, not from that rule — holding a separator to 3:1 would force
           a heavy line between every row for no gain. Only a border on all four
           sides is the boundary of a control, which is what 1.4.11 is about. */
        const w = parseFloat(cs.borderTopWidth) || 0;
        const sides = ["borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth"];
        if (!sides.every((k) => (parseFloat(cs[k]) || 0) > 0)) continue;
        const bc = cs.borderTopColor;
        if (!w || !bc || bc === "rgba(0, 0, 0, 0)" || /, *0\)$/.test(bc)) continue;
        /* A filled control carries its own contrast through its background;
           the border is then decoration on top of a shape already visible. */
        const own = cs.backgroundColor;
        if (own && own !== "rgba(0, 0, 0, 0)" && !/, *0\)$/.test(own)) continue;
        out.push({ border: bc, bg: bgOf(el),
          cls: (el.className || "").toString().slice(0, 22) || el.tagName.toLowerCase() });
      }
      return out;
    });
    for (const x of rows) {
      const fg = parse(x.border), bg = parse(x.bg);
      if (fg.length < 3 || bg.length < 3) continue;
      const a = fg.length > 3 ? fg[3] : 1;
      const eff = a < 1 ? fg.slice(0, 3).map((c, i) => c * a + bg[i] * (1 - a)) : fg.slice(0, 3);
      const rr = ratio(eff, bg.slice(0, 3));
      seen++;
      if (rr < worst.r) worst = { r: rr, what: `${theme} ${r} .${x.cls}` };
      if (rr < 3) { note("contrast", `${theme} ${r} — border of .${x.cls} ${rr.toFixed(2)}:1 (needs 3)`); bad++; }
    }
  }
  console.log(`   ${theme}: ${seen} control edges measured, ${bad} below 3:1, worst ${worst.r.toFixed(2)}:1 — ${worst.what}`);
  await ctx.close();
}

/* ============ 4 · RTL INTEGRITY ============ */
console.log("\n── ٤ · سلامة الاتجاه — RTL integrity");
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  await pg.goto(B + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(400); await pg.evaluate(SEED);
  let phys = 0, arrows = 0;
  for (const r of ROUTES) {
    await pg.goto(B + "/index.html" + r, { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(430);
    const v = await pg.evaluate(() => {
      const out = { phys: [], arrows: [], dir: document.documentElement.dir };
      for (const el of document.querySelectorAll("[style]")) {
        const s = el.getAttribute("style") || "";
        /* physical sides in an RTL app mirror wrongly; logical props exist */
        const m = s.match(/(?:^|;)\s*(margin-left|margin-right|padding-left|padding-right|left|right|text-align\s*:\s*(?:left|right))/);
        if (m) out.phys.push({ c: (el.className || "").toString().slice(0, 22), s: s.slice(0, 60) });
      }
      /* an arrow BETWEEN two numeric runs is the bidi trap */
      for (const el of document.querySelectorAll("*")) {
        if (el.children.length > 4) continue;
        const t = el.textContent || "";
        if (/[\d٠-٩][^\n]{0,12}[←→⟵⟶][^\n]{0,12}[\d٠-٩]/.test(t)) out.arrows.push(t.replace(/\s+/g, " ").slice(0, 40));
      }
      return out;
    });
    for (const p of v.phys) { note("rtl", `${r} — physical property: .${p.c} {${p.s}}`); phys++; }
    for (const a of [...new Set(v.arrows)]) { note("rtl", `${r} — arrow between numbers: "${a}"`); arrows++; }
  }
  console.log(`   physical side properties: ${phys} · arrows between numbers: ${arrows}`);
  await ctx.close();
}

/* ============ 5 · DEAD ENDS ============ */
console.log("\n── ٥ · الطرق المسدودة — dead ends");
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  await pg.goto(B + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(400); await pg.evaluate(SEED);
  let stuck = 0, occl = 0;
  for (const r of ROUTES) {
    await pg.goto(B + "/index.html" + r, { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(430);
    /* The first version of this counted any `a[href^="#/"]` on the page and so
       never fired — it reported zero dead ends on the build that had sixteen
       routes with no tab bar. A detector that cannot fail is not a detector.
       These two DO fail on that build: 16 routes with no bar, 0 of 6 nav-
       bearing routes reserving its height. */
    const v = await pg.evaluate(() => {
      const nav = document.querySelector(".nav");
      const bar = nav || document.querySelector(".actionbar");
      const out = { hasBar: !!nav, hasBack: !!document.querySelector(".hdr-back, .b-g[onclick*='goBack']"),
                    reserved: null, clear: null };
      if (nav) {
        const sp = nav.previousElementSibling;
        out.reserved = !!sp && sp.classList.contains("nav-space")
          && sp.getBoundingClientRect().height >= nav.getBoundingClientRect().height;
      }
      if (bar) {
        window.scrollTo(0, document.body.scrollHeight);
        const bb = bar.getBoundingClientRect();
        const all = [...document.querySelectorAll(".rw,a,button,p,h2")]
          .filter((e) => !e.closest(".nav") && !e.closest(".actionbar") && e.getBoundingClientRect().height);
        const last = all[all.length - 1];
        out.clear = last ? Math.round(bb.top - last.getBoundingClientRect().bottom) : null;
      }
      return out;
    });
    if (!v.hasBar && !v.hasBack) { note("deadend", `${r} — neither a tab bar nor a back control`); stuck++; }
    if (v.reserved === false) { note("deadend", `${r} — a fixed tab bar whose height is not reserved`); occl++; }
    if (v.clear != null && v.clear < 0) { note("deadend", `${r} — content ${-v.clear}px under a fixed bar`); occl++; }
  }
  console.log(`   routes with no way onward: ${stuck} · unreserved or occluding bars: ${occl}`);
  await ctx.close();
}

/* ============ 6 · TEXT CLIPPING ============ */
console.log("\n── ٦ · النص المقصوص — clipped text");
{
  const ctx = await b.newContext({ viewport: { width: 360, height: 800 } });
  const pg = await ctx.newPage();
  await pg.goto(B + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(400); await pg.evaluate(SEED);
  let clipped = 0;
  for (const r of ROUTES) {
    await pg.goto(B + "/index.html" + r, { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(430);
    for (const c of await pg.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("*")) {
        const cs = getComputedStyle(el);
        if (cs.overflow === "visible" || cs.display === "none") continue;
        if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== "auto" && cs.overflowX !== "scroll") {
          const t = (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 30);
          if (t) out.push(`${t} (${el.clientWidth}<${el.scrollWidth})`);
        }
      }
      return out.slice(0, 4);
    })) { note("clip", `360px ${r} — ${c}`); clipped++; }
  }
  console.log(`   clipped text nodes: ${clipped}`);
  await ctx.close();
}

/* ============ 7 · KEYBOARD FOCUS ============ */
console.log("\n── ٧ · التركيز بلوحة المفاتيح — visible focus");
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  await pg.goto(B + "/index.html#/record", { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(400); await pg.evaluate(SEED);
  await pg.goto(B + "/index.html#/record", { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(600);
  let invisible = 0, n = 0;
  for (let i = 0; i < 12; i++) {
    await pg.keyboard.press("Tab");
    const v = await pg.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return { tag: el.tagName, txt: (el.innerText || "").slice(0, 20).replace(/\s+/g, " "),
               outline: cs.outlineStyle + " " + cs.outlineWidth, shadow: cs.boxShadow };
    });
    if (!v) continue;
    n++;
    const shown = (v.outline && !/none/.test(v.outline)) || (v.shadow && v.shadow !== "none");
    if (!shown) { note("focus", `#/record — "${v.txt}" (${v.tag}) has no visible focus ring`); invisible++; }
  }
  console.log(`   ${n} stops walked, ${invisible} with no visible ring`);
  await ctx.close();
}

/* ============ ٨ · REDUCED MOTION ============
   This file had six separate `prefers-reduced-motion` blocks, each listing the
   animated selectors its author remembered. A person who sets that preference
   because motion makes them ill cannot audit a stylesheet to find out which
   animations were on the list. So it is measured instead of asserted: emulate
   the preference, walk every element on the busiest routes, and report anything
   still carrying a real animation or transition duration. */
console.log("\n── ٨ · الحركة عند تفضيل تقليلها — reduced motion");
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 880 },
    reducedMotion: "reduce" });
  const pg = await ctx.newPage();
  await pg.goto(B + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(400); await pg.evaluate(SEED);
  let moving = 0, walked = 0;
  for (const r of ["#/", "#/record", "#/record/labs", "#/needs", "#/doctors"]) {
    await pg.goto(B + "/index.html" + r, { waitUntil: "domcontentloaded" });
    await pg.reload({ waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(500);
    const bad = await pg.evaluate(() => {
      const out = [];
      const dur = (v) => Math.max(0, ...String(v).split(",").map((x) => {
        const t = x.trim();
        return t.endsWith("ms") ? parseFloat(t) : parseFloat(t) * 1000;
      }).filter((x) => !isNaN(x)));
      for (const el of document.querySelectorAll("*")) {
        const cs = getComputedStyle(el);
        const a = cs.animationName !== "none" ? dur(cs.animationDuration) : 0;
        const t = dur(cs.transitionDuration);
        /* 1ms is the collapse target; anything above it is real motion. */
        if (a > 1 || t > 1) out.push(`${el.tagName.toLowerCase()}.${
          String(el.className).split(" ")[0]} anim=${Math.round(a)}ms trans=${Math.round(t)}ms`);
      }
      return [...new Set(out)];
    });
    walked++;
    for (const x of bad.slice(0, 4)) { note("motion", `${r} — ${x}`); moving++; }
  }
  console.log(`   ${walked} routes walked with the preference set, ${moving} elements still animating`);
  await ctx.close();
}

/* ============ ٩ · ARABIC INSIDE AN LTR RUN ============
   `direction: ltr` on `.num`/`.n`/`.nval`/`.mono` protects a number from the
   Arabic AROUND it. It does nothing about Arabic INSIDE it — and there the
   effect reverses: an Arabic unit is AL, the joining space resolves to R
   because the digits act as R, and reversing that level-1 region puts the unit
   BEFORE the number. «20 ملغم» rendered «ملغم 20» on every row of the medicine
   list, and «25,000 د.ع» rendered «د.ع 18,000» on the pharmacy screen while the
   same helper rendered it correctly on the doctors list one tap away.

   A dose whose unit precedes its number is a prescribing hazard, so this is
   measured rather than remembered: any element that forces an LTR direction and
   contains an Arabic character is reported, with its text. */
console.log("\n── ٩ · العربي داخل مجرى LTR — Arabic inside an LTR run");
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 880 } });
  const pg = await ctx.newPage();
  await pg.goto(B + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(400); await pg.evaluate(SEED);
  await pg.evaluate(() => localStorage.setItem("qrb.lang", JSON.stringify("ar")));
  let bad = 0, walked = 0;
  for (const r of ROUTES) {
    await pg.goto(B + "/index.html" + r, { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(430);
    const hits = await pg.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("*")) {
        const cs = getComputedStyle(el);
        if (cs.direction !== "ltr") continue;
        /* Only a run that IMPOSES ltr on itself. An element merely inheriting
           ltr from an English document is not the defect. */
        const pd = el.parentElement ? getComputedStyle(el.parentElement).direction : "ltr";
        if (pd === "ltr") continue;
        const txt = (el.textContent || "");
        if (!/[\u0600-\u06FF]/.test(txt)) continue;
        out.push(`.${String(el.className).slice(0, 20) || el.tagName.toLowerCase()} "${
          txt.replace(/\s+/g, " ").trim().slice(0, 28)}"`);
      }
      return [...new Set(out)];
    });
    walked++;
    for (const h of hits.slice(0, 4)) { note("ltrun", `${r} — ${h}`); bad++; }
  }
  console.log(`   ${walked} routes walked, ${bad} LTR runs containing Arabic`);
  await ctx.close();
}

/* ============ REPORT ============ */
await b.close();
console.log("\n" + "═".repeat(60));
const order = [["render", "شاشة ما رسمت"], ["touch", "هدف لمس أصغر من ٤٤"], ["overflow", "فيضان أفقي"],
  ["contrast", "تباين تحت الحد"], ["rtl", "مشكلة اتجاه"], ["deadend", "طريق مسدود"],
  ["clip", "نص مقصوص"], ["focus", "تركيز غير مرئي"], ["motion", "حركة مع تفضيل التقليل"], ["ltrun", "عربي داخل مجرى LTR"]];
let total = 0;
for (const [k, ar] of order) {
  const list = fail[k];
  total += list.length;
  console.log(`${String(list.length).padStart(4)}  ${k.padEnd(9)} ${ar}`);
  for (const x of list.slice(0, 6)) console.log(`        · ${x}`);
  if (list.length > 6) console.log(`        · … and ${list.length - 6} more`);
}
console.log("═".repeat(60));
console.log(`TOTAL FINDINGS: ${total}`);
writeFileSync("/tmp/qareeb-audit.json", JSON.stringify(fail, null, 1));
