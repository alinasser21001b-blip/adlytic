#!/usr/bin/env node
/**
 * The Responsive Validation Harness.
 *
 * Renders every registered screen state at every width the product claims to
 * support and MEASURES what happens, rather than asking somebody to look.
 *
 * Nothing here fixes anything. Every check below reports a fact taken from the
 * live document — a box that left the viewport, a clamp that engaged, a control
 * shorter than the floor, an order that changed. Where a property cannot be
 * measured honestly it is declared unmeasured and says so in the report; a
 * green tick that means "not checked" is worse than a blank.
 *
 * Widths: 320 is the smallest Android phone still in use in Iraq (and the one
 * the design brief singles out), 360 is the delivered artboard, 390 is what the
 * gallery has always shot, 430 is the largest current iPhone.
 */
import { chromium } from "playwright";
import { readdirSync, mkdirSync, existsSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const SRC = join(REPO, "review/screens");
const OUT = join(REPO, "review/responsive");

/** The reference width. Order and hierarchy are compared against this one,
 *  because it is the width every existing screenshot was approved at. */
const REFERENCE = 390;
const WIDTHS = [320, 360, 390, 430];
const HEIGHT = 844;

/** §25. A control below this is a control a thumb misses. */
const TAP_FLOOR = 44;

/** The accent, read from the palette the review already measured, so the
 *  dominant-control check compares against the real token rather than a hex
 *  copied into this file. */
const palette = JSON.parse(readFileSync(join(REPO, "review/data.json"), "utf8")).design.palette.dark;
const ACCENT_RGB = (() => {
  const h = palette.accent.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
})();

if (!existsSync(SRC)) {
  console.error("review/screens is empty — run the render step first");
  process.exit(1);
}
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const CANDIDATES = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium/chrome-linux/chrome",
];
const executablePath = CANDIDATES.find((p) => existsSync(p));
const browser = executablePath ? await chromium.launch({ executablePath }) : await chromium.launch();

/**
 * Everything measured inside one page, at one width.
 *
 * Runs in the browser: these are properties of a laid-out document and cannot
 * be derived from the source. Each returns raw observations — the severity
 * judgement happens outside, so the rules are readable in one place.
 */
const MEASURE = ({ floor, accent }) => {
  const vw = document.documentElement.clientWidth;
  const all = [...document.querySelectorAll("*")];
  const box = (e) => e.getBoundingClientRect();
  const text = (e) => (e.textContent || "").trim();
  const cs = (e) => getComputedStyle(e);
  const INTERACTIVE = new Set(["button", "radio", "link", "checkbox", "switch"]);

  /* 1 — horizontal overflow, measured from the boxes rather than from
        `scrollWidth`. The page sets `overflow: hidden` to emulate a device, so
        the document can never REPORT a scroll width larger than its client
        width — the first version of this check therefore could not fire on any
        screen, and said so only when the self-test asked it to. */
  let widest = 0;
  for (const e of document.querySelectorAll("*")) {
    const r = e.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) widest = Math.max(widest, r.right, vw - r.left);
  }
  const overflow = Math.max(0, Math.round(widest - vw));

  /* 2 — any box that left the viewport sideways. A card cropped at the edge is
        invisible to the eye at a glance and obvious to a rectangle. */
  const escaped = [];
  for (const e of all) {
    const r = box(e);
    if (r.width === 0 || r.height === 0) continue;
    const over = Math.max(0 - r.left, r.right - vw);
    if (over > 0.5) escaped.push({ tag: e.tagName, label: e.getAttribute("aria-label") || text(e).slice(0, 40), by: Math.round(over) });
  }

  /* 3 — touch targets. Height is the floor that matters for a row control;
        width is reported separately because a text link narrower than 44 is
        still reachable if it is tall enough. */
  const smallTargets = [];
  for (const e of all) {
    const role = e.getAttribute("role");
    if (!role || !INTERACTIVE.has(role)) continue;
    const r = box(e);
    if (r.height === 0) continue;
    if (r.height < floor - 0.5) smallTargets.push({ label: e.getAttribute("aria-label") || text(e).slice(0, 40), h: Math.round(r.height), w: Math.round(r.width) });
  }

  /* 4 — text the box could not hold. `scrollHeight` beyond `clientHeight` on a
        clipping element is content that has been cut off, not content that
        wrapped. */
  const clipped = [];
  const truncated = [];
  for (const e of all) {
    const s = cs(e);
    // A LEAF only. A container whose children overflow is either a scroller
    // (which is how a phone screen works) or a parent reporting its child's
    // problem a second time — the first version of this check flagged the
    // whole scroll body of every screen and said the entire page was cut off.
    if (e.children.length > 0) continue;
    if (!text(e)) continue;
    const scrolls = /auto|scroll/.test(s.overflow + s.overflowY);
    if (scrolls) continue;
    const clamped = s.webkitLineClamp !== "none" && s.webkitLineClamp !== "";
    const hidden = s.overflow === "hidden" || s.overflowY === "hidden";
    if (!clamped && !hidden) continue;
    const cut = e.scrollHeight - e.clientHeight;
    if (cut <= 1) continue;
    // A clamp is truncation the screen ASKED for — numberOfLines, with an
    // ellipsis, which a designer chose. Overflow hidden without a clamp is text
    // that simply vanished. They are different defects and were being counted
    // as one.
    if (clamped) truncated.push({ label: text(e).slice(0, 50), lines: s.webkitLineClamp, by: cut });
    else clipped.push({ label: text(e).slice(0, 50), cut });
  }

  /* 5 — a control whose label wrapped onto a second line. Measured from the
        text child's height against its own line box, so it holds for any type
        role rather than assuming a size. */
  const wrappedControls = [];
  for (const e of all) {
    const role = e.getAttribute("role");
    if (role !== "button" && role !== "radio") continue;
    for (const child of e.querySelectorAll("span")) {
      const s = cs(child);
      const lh = parseFloat(s.lineHeight);
      if (!lh || !text(child)) continue;
      const lines = Math.round(box(child).height / lh);
      if (lines > 1) wrappedControls.push({ label: text(child).slice(0, 40), lines });
      break;
    }
  }

  /* 6 — RTL. The document runs right-to-left; anything that opted out must be
        a Latin run (a drug name, a reservation code), because that is the only
        reason the product ever sets a direction. */
  const rtl = { root: cs(document.documentElement).direction, strays: [] };
  for (const e of all) {
    if (cs(e).direction !== "ltr") continue;
    const own = text(e);
    if (!own) continue;
    // A parent that is already ltr does not count twice.
    if (e.parentElement && cs(e.parentElement).direction === "ltr") continue;
    if (!/[A-Za-z]/.test(own)) rtl.strays.push({ label: own.slice(0, 40) });
  }
  // The affordance that actually shipped wrong once: back must be on the
  // leading edge, which under RTL is the right one.
  const back = document.querySelector('[aria-label="رجوع"]');
  rtl.backOnRight = back ? box(back).left > vw / 2 : null;

  /* 7 — hierarchy. Exactly one dominant control, and the vertical order of the
        labelled things on the screen, so a reflow that reorders them is
        visible as a difference rather than as a feeling. */
  const dominant = all.filter((e) => {
    const r = box(e);
    return e.getAttribute("role") === "button"
      && r.height >= 48 && r.width > vw * 0.6
      && cs(e).backgroundColor === accent;
  }).map((e) => e.getAttribute("aria-label"));

  const order = all
    .filter((e) => e.getAttribute("aria-label") || (e.getAttribute("role") && text(e)))
    .map((e) => {
      const r = box(e);
      // Bucketed to the 8pt half-step: two controls side by side differ in
      // height when one label wraps, and comparing raw tops reported that as a
      // reordering when nothing had moved.
      return { key: e.getAttribute("aria-label") || text(e).slice(0, 30), row: Math.round(r.top / 8), x: r.right };
    })
    // Right to left within a row, top to bottom between rows.
    .sort((a, b) => a.row - b.row || b.x - a.x)
    .map((e) => e.key);

  /* 8 — distances that are not on the rhythm. Read from the computed style, so
        a value typed outside the scale is caught wherever it was typed. */
  const offScale = new Set();
  for (const e of all) {
    const s = cs(e);
    for (const prop of ["gap", "rowGap", "columnGap", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight"]) {
      const v = parseFloat(s[prop]);
      if (Number.isFinite(v) && v > 0 && !(v % 4 === 0 && v <= 64)) offScale.add(`${prop}: ${Math.round(v * 10) / 10}px`);
    }
  }

  return {
    overflow, escaped, smallTargets, clipped, truncated, wrappedControls, rtl,
    dominant, order, offScale: [...offScale],
    contentHeight: document.documentElement.scrollHeight,
  };
};

/* ── Prove the detectors before trusting them ───────────────────────────────
 *
 * A harness that reports "0 fail" is worthless until it has been shown to fail.
 * This page carries one deliberate instance of every defect the harness claims
 * to detect; if any detector stays silent, the whole run aborts, because a
 * green responsive report would then be a false statement about the product.
 * It runs at 320pt, where the injected geometry is unambiguous.
 */
const SELF_TEST = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<style>*{box-sizing:border-box;margin:0;padding:0}html,body{width:100%;height:100vh;overflow:hidden}</style>
</head><body>
  <div style="width:500px;height:20px;background:#333"></div>
  <div role="button" aria-label="short" style="height:20px;width:200px">قصير</div>
  <div style="overflow:hidden;height:14px;width:200px;line-height:14px">سطر أول وسطر ثاني وسطر ثالث يتجاوز الصندوق بكثير جداً وهكذا</div>
  <span style="display:block;overflow:hidden;-webkit-line-clamp:1;-webkit-box-orient:vertical;display:-webkit-box;width:60px;line-height:20px">عنوان طويل جداً لا يتسع</span>
  <div role="button" aria-label="wrap" style="width:80px;height:60px"><span style="display:block;line-height:20px">نص طويل يلتف على أكثر من سطر واحد</span></div>
  <div style="direction:ltr">نص عربي بالاتجاه الخاطئ</div>
  <div aria-label="رجوع" style="position:absolute;left:0;top:0;width:44px;height:44px"></div>
  <div role="button" aria-label="one" style="height:48px;width:300px;background:${palette.accent}"></div>
  <div role="button" aria-label="two" style="height:48px;width:300px;background:${palette.accent}"></div>
  <div style="padding-top:7px"></div>
</body></html>`;

{
  const page = await browser.newPage({ viewport: { width: 320, height: HEIGHT }, deviceScaleFactor: 1 });
  await page.setContent(SELF_TEST, { waitUntil: "load" });
  const m = await page.evaluate(MEASURE, { floor: TAP_FLOOR, accent: ACCENT_RGB });
  await page.close();

  const mustFire = [
    ["horizontal overflow", m.overflow > 0],
    ["cropped card", m.escaped.length > 0],
    ["touch target below the floor", m.smallTargets.length > 0],
    ["clipped text", m.clipped.length > 0],
    ["truncated typography", m.truncated.length > 0],
    ["wrapped button", m.wrappedControls.length > 0],
    ["RTL regression (stray direction)", m.rtl.strays.length > 0],
    ["RTL regression (back on the wrong edge)", m.rtl.backOnRight === false],
    ["broken hierarchy (competing primaries)", m.dominant.length > 1],
    ["inconsistent spacing", m.offScale.length > 0],
  ];
  const silent = mustFire.filter(([, fired]) => !fired).map(([name]) => name);
  if (silent.length) {
    console.error(`\nResponsive harness self-test FAILED — ${silent.length} detector(s) did not fire:`);
    for (const n of silent) console.error(`  ${n}`);
    console.error("\nA responsive report from these detectors would be a false statement.\n");
    await browser.close();
    process.exit(1);
  }
  var SELF_TEST_DETECTORS = mustFire.length;
}

const files = readdirSync(SRC).filter((f) => f.endsWith(".html")).sort();
const screens = [];

for (const file of files) {
  const name = basename(file, ".html");
  const atWidth = {};

  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: HEIGHT }, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(join(SRC, file)).href, { waitUntil: "load" });
    const m = await page.evaluate(MEASURE, { floor: TAP_FLOOR, accent: ACCENT_RGB });
    await page.screenshot({ path: join(OUT, `${name}@${width}.png`) });
    await page.close();
    atWidth[width] = m;
  }

  /* ── Judge. Fail is "a patient cannot use this"; minor is "a designer would
        call it out". Nothing here is a preference. ─────────────────────────── */
  const issues = [];
  const ref = atWidth[REFERENCE];

  for (const width of WIDTHS) {
    const m = atWidth[width];
    const at = (s) => `${width}pt: ${s}`;

    if (m.overflow > 0) issues.push({ severity: "fail", width, kind: "horizontal overflow", says: at(`the page scrolls sideways by ${m.overflow}px`) });
    for (const e of m.escaped) issues.push({ severity: "fail", width, kind: "cropped card", says: at(`«${e.label}» extends ${e.by}px past the viewport`) });
    for (const t of m.smallTargets) issues.push({ severity: "fail", width, kind: "touch target", says: at(`«${t.label}» is ${t.h}pt tall, below the ${TAP_FLOOR}pt floor`) });
    for (const c of m.clipped) issues.push({ severity: "fail", width, kind: "clipped text", says: at(`«${c.label}» is cut off by ${c.cut}px`) });
    for (const s of m.rtl.strays) issues.push({ severity: "fail", width, kind: "RTL regression", says: at(`«${s.label}» renders left-to-right but carries no Latin run`) });
    if (m.rtl.root !== "rtl") issues.push({ severity: "fail", width, kind: "RTL regression", says: at(`the document direction is ${m.rtl.root}`) });
    if (m.rtl.backOnRight === false) issues.push({ severity: "fail", width, kind: "RTL regression", says: at("the back control is on the left edge") });
    if (m.dominant.length > 1) issues.push({ severity: "fail", width, kind: "broken hierarchy", says: at(`${m.dominant.length} dominant controls compete: ${m.dominant.join(" · ")}`) });

    for (const t of m.truncated) issues.push({ severity: "minor", width, kind: "truncated typography", says: at(`«${t.label}» is ellipsised at ${t.lines} line(s), ${t.by}px of text hidden`) });
    for (const w of m.wrappedControls) issues.push({ severity: "minor", width, kind: "wrapped button", says: at(`«${w.label}» wraps onto ${w.lines} lines`) });
    for (const d of m.offScale) issues.push({ severity: "minor", width, kind: "inconsistent spacing", says: at(`${d} is not on the 4pt rhythm`) });

    if (width !== REFERENCE) {
      // A reflow SHOULD change heights. What must not change is which thing
      // comes before which — that is the screen's meaning, not its shape.
      if (JSON.stringify(m.order) !== JSON.stringify(ref.order))
        issues.push({ severity: "fail", width, kind: "layout shift", says: at("the reading order differs from the reference width") });
      if (m.dominant.join("|") !== ref.dominant.join("|"))
        issues.push({ severity: "fail", width, kind: "broken hierarchy", says: at("a different set of dominant controls than at the reference width") });
    }
  }

  const verdict = issues.some((i) => i.severity === "fail") ? "fail"
    : issues.length ? "minor" : "pass";

  screens.push({
    name, verdict, issues,
    heights: Object.fromEntries(WIDTHS.map((w) => [w, atWidth[w].contentHeight])),
    shots: Object.fromEntries(WIDTHS.map((w) => [w, `responsive/${name}@${w}.png`])),
  });
}

await browser.close();

/**
 * What this harness does NOT measure, stated rather than implied.
 *
 * Each of these needs something the DOM cannot supply — a font metric the
 * bundle does not have, a device the CI does not run on, or a design
 * specification that has not been delivered.
 */
const UNMEASURED = [
  ["Dynamic type / 200% text", "No text-scaling pass runs. The brief requires legibility at 200%; nothing here resizes the root font, so a layout that breaks under it would report green."],
  ["Real device fonts", "Screenshots use the CI's fallback family, not the delivered Arabic face, which is not bundled. Line-breaking and therefore wrapping WILL differ on a device."],
  ["Landscape", "Every width is measured at 844pt tall. No rotated layout has ever been rendered."],
  ["Safe-area insets", "frame.safeTop/safeBottom are fixed values, not real device insets. A notch or a home indicator is approximated, not measured."],
  ["Scroll-dependent behaviour", "Sticky slots are photographed at scroll position 0 only."],
];

const summary = {
  selfTestDetectors: SELF_TEST_DETECTORS,
  widths: WIDTHS, reference: REFERENCE, tapFloor: TAP_FLOOR,
  screens, unmeasured: UNMEASURED,
  pass: screens.filter((s) => s.verdict === "pass").length,
  minor: screens.filter((s) => s.verdict === "minor").length,
  fail: screens.filter((s) => s.verdict === "fail").length,
};
writeFileSync(join(REPO, "review/responsive.json"), JSON.stringify(summary, null, 2), "utf8");

const MARK = { pass: "PASS ", minor: "MINOR", fail: "FAIL " };
console.log(`\nResponsive validation — ${WIDTHS.join(" · ")}pt\n`);
for (const s of screens) {
  if (s.verdict === "pass") continue;
  console.log(`  ${MARK[s.verdict]} ${s.name}`);
  const seen = new Set();
  for (const i of s.issues) {
    const key = `${i.kind}|${i.says}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`         ${i.kind} — ${i.says}`);
  }
}
console.log(`\n  ${summary.pass} pass · ${summary.minor} minor · ${summary.fail} fail`);
console.log(`  ${screens.length} state(s) × ${WIDTHS.length} widths = ${screens.length * WIDTHS.length} renders`);
console.log(`  ${SELF_TEST_DETECTORS} detector(s) proved to fire against injected defects`);
console.log(`  ${UNMEASURED.length} propert(ies) declared unmeasured — see the report\n`);

// Measuring is not gating. This step reports; it does not block a push, because
// the milestone is evidence and the layouts have not been built for these
// widths yet. The Review Dashboard carries the verdict.
