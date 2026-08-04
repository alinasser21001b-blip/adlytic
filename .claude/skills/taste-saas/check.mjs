#!/usr/bin/env node
/**
 * taste-saas/check.mjs — alignment audit. Tests RELATIONS, not magic
 * numbers. The skill encodes a recipe; projects will adapt it. This
 * checker measures whether the adaptation is INTERNALLY CONSISTENT, not
 * whether it matches one specific px value.
 *
 * Principle:
 *   - Don't assert `height === 44`. Assert "the three top rows are
 *     within 1px of each other, whatever their height."
 *   - Don't assert `font-size === 14`. Assert "the type scale has a
 *     visible step ratio of >=1.125 between adjacent sizes."
 *   - Don't require a magic selector like `#dt-header-scroll`. Look
 *     for any horizontally-scrollable container with a sibling
 *     header table and ask whether their colgroups match.
 *   - Spacing should snap to a single base unit (4 or 8). Mixed bases
 *     (`mt-3.5` next to `mt-4` next to `mt-5`) read as sloppy.
 *
 * Output is advisory. Failures point at sloppy code; warnings flag
 * things the script couldn't measure (no app running, no list page
 * mounted, etc.) without claiming the project is broken.
 *
 * STACK ASSUMPTIONS
 *   This checker greps source for Tailwind utility classes (`h-11`,
 *   `text-xs`, `bg-bg-surface`, `px-3`, …) when running in --static
 *   mode. If your project uses vanilla CSS / CSS modules / Panda / etc.
 *   the static checks will mostly skip with INFO results — but the
 *   --runtime DOM checks (sticky thead, x-axis alignment, focus ring,
 *   tabular-nums, chart colors) are framework-agnostic and still
 *   apply. To adapt the static regex to a non-Tailwind project, edit
 *   the patterns near each `search(/...regex.../)` call.
 *
 * Usage:
 *   node ~/.claude/skills/taste-saas/check.mjs <project> [--static] [--runtime] [--url=...] [--json] [--strict]
 *
 * --strict promotes warnings to failures. Default is lenient.
 *
 * Exit code = 0 unless --strict or there are real fails.
 */

import { execSync, spawn } from "node:child_process";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { argv, exit, stdout } from "node:process";

const args = argv.slice(2);
const projectRoot = resolve(args.find((a) => !a.startsWith("--")) || ".");
const wantJson = args.includes("--json");
const onlyStatic = args.includes("--static");
const onlyRuntime = args.includes("--runtime");
const strict = args.includes("--strict");
const urlArg = args.find((a) => a.startsWith("--url="));
const url = urlArg ? urlArg.slice(6) : "http://localhost:5173";

if (!existsSync(projectRoot)) {
  console.error(`taste-saas/check: project root not found: ${projectRoot}`);
  exit(2);
}

// ─── reporter ──────────────────────────────────────────────────────────
const results = [];
const pass = (id, msg) => results.push({ id, status: "pass", msg });
const fail = (id, msg, hint) => results.push({ id, status: "fail", msg, hint });
const warn = (id, msg, hint) => results.push({ id, status: "warn", msg, hint });
const info = (id, msg) => results.push({ id, status: "info", msg });

// ─── source walk ───────────────────────────────────────────────────────
const SRC_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".css"]);
const SKIP = new Set(["node_modules", "dist", "build", ".next", ".turbo", ".cache", ".git", "coverage", ".vite", "out"]);
function walk(dir, out = []) {
  let entries; try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (SRC_EXTS.has(name.slice(name.lastIndexOf(".")))) out.push(p);
  }
  return out;
}
const sourceFiles = walk(projectRoot);
const fileText = new Map();
for (const f of sourceFiles) { try { fileText.set(f, readFileSync(f, "utf8")); } catch {} }

function search(re) {
  const hits = [];
  for (const [path, text] of fileText) {
    const local = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m; while ((m = local.exec(text))) {
      const line = text.slice(0, m.index).split("\n").length;
      hits.push({ file: relative(projectRoot, path), line, match: m[0] });
    }
  }
  return hits;
}

// ────────────────────────────────────────────────────────────────────────
// STATIC PASS — relations & smell tests, not equality checks.
// ────────────────────────────────────────────────────────────────────────
function runStatic() {
  // ── S1. viewport lock — required for shell to stay pinned ────────────
  const cssFiles = sourceFiles.filter((f) => f.endsWith(".css"));
  const hasLock = cssFiles.some((f) => {
    const t = fileText.get(f) || "";
    return /html\s*,?\s*body\s*,?\s*#?\w+\s*\{[^}]*height\s*:\s*100%[^}]*overflow\s*:\s*hidden/s.test(t)
      || (/html[^{]*\{[^}]*overflow\s*:\s*hidden/s.test(t)
        && /body[^{]*\{[^}]*overflow\s*:\s*hidden/s.test(t));
  });
  hasLock
    ? pass("S1", "viewport lock present (html/body/root pinned)")
    : fail("S1", "no viewport-lock CSS rule found",
        "shell can't stay pinned without `html, body, #root { height: 100%; overflow: hidden }`");

  // ── S2. spacing grid — Tailwind spacing tokens should mostly share
  // one base. Mixing `mt-3, mt-3.5, mt-4, mt-5` reads as ad-hoc. We
  // don't enforce 4 vs 8; we enforce that one is dominant.
  const spacingTokens = search(/\b(?:m|p|gap|space-[xy])-(t|b|l|r|x|y)?-?(\d+(?:\.\d+)?)\b/);
  if (spacingTokens.length >= 20) {
    const buckets = { four: 0, eight: 0, half: 0, other: 0 };
    for (const h of spacingTokens) {
      const n = parseFloat(h.match[h.match.lastIndexOf("-") + 1] || "0")
        || parseFloat(h.match.split("-").pop());
      if (Number.isNaN(n)) continue;
      const px = n * 4;
      if (px % 8 === 0) buckets.eight++;
      else if (px % 4 === 0) buckets.four++;
      else if (n % 0.5 === 0) buckets.half++;
      else buckets.other++;
    }
    const total = Object.values(buckets).reduce((a, b) => a + b, 0);
    const onGrid = (buckets.four + buckets.eight) / total;
    const halfPct = buckets.half / total;
    if (onGrid > 0.85) {
      pass("S2", `spacing grid coherent: ${(onGrid * 100).toFixed(0)}% on 4px grid, ${(halfPct * 100).toFixed(0)}% half-step`);
    } else if (onGrid > 0.7) {
      warn("S2", `spacing somewhat off-grid: only ${(onGrid * 100).toFixed(0)}% lands on 4px multiples (${buckets.half} half-steps, ${buckets.other} other)`,
        "prefer p-2/3/4/6/8 over scattered p-3.5/p-5/p-7 — pick one base and stick to it");
    } else {
      fail("S2", `spacing scattered: only ${(onGrid * 100).toFixed(0)}% on a coherent grid`,
        "consolidate to a single base spacing unit (Tailwind p-1=4px, p-2=8px, etc.); arbitrary half-steps make rhythm sloppy");
    }
  } else {
    info("S2", `not enough spacing tokens to evaluate grid coherence (${spacingTokens.length})`);
  }

  // ── S3. height-token coherence — h-* utilities should cluster around
  // a few canonical heights, not scatter. Same idea as S2 but for height.
  // Only counts "interactive surface" heights (>= h-5 / 20px); micro
  // utility heights (h-1.5 dot, h-4 checkbox, h-6 small icon button) are
  // legitimately tiny and don't belong on a chrome height ladder.
  const heightTokens = search(/\bh-(\d+(?:\.\d+)?)\b/);
  const chromeHeights = heightTokens.filter((h) => {
    const n = parseFloat(h.match.slice(2));
    return n >= 5; // h-5 (20px) and up are the chrome-scale heights
  });
  if (chromeHeights.length >= 10) {
    const freq = new Map();
    for (const h of chromeHeights) {
      const v = h.match.slice(2);
      freq.set(v, (freq.get(v) || 0) + 1);
    }
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const totalUsed = chromeHeights.length;
    const topShare = top.reduce((s, [, n]) => s + n, 0) / totalUsed;
    topShare > 0.7
      ? pass("S3", `height tokens cluster: top 5 (${top.map(([v, n]) => `h-${v}(${n})`).join(" ")}) cover ${(topShare * 100).toFixed(0)}% of chrome heights`)
      : warn("S3", `chrome heights scattered: top 5 only cover ${(topShare * 100).toFixed(0)}% — likely ad-hoc sizing`,
        "consolidate around the canonical scale (h-7 dense chip, h-8 chip/btn, h-9 input, h-11 chrome row, h-28 KPI, h-56/72 chart)");
  }

  // ── S4. font scale step — type scale should step >= ~1.125x between
  // adjacent sizes. Three text-sm next to two text-base looks ad-hoc.
  const fontHits = search(/\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|\[(?:[\d.]+(?:px|rem|em))\])/);
  if (fontHits.length >= 10) {
    const sizes = new Map();
    for (const h of fontHits) {
      const tok = h.match.slice(5);
      sizes.set(tok, (sizes.get(tok) || 0) + 1);
    }
    const used = sizes.size;
    if (used <= 6 && used >= 3) {
      pass("S4", `type scale uses ${used} distinct sizes (${[...sizes.keys()].join(", ")}) — coherent`);
    } else if (used > 6) {
      warn("S4", `${used} distinct font sizes in use — probably too many`,
        "console UI rarely needs >5 sizes; consolidate adjacent ones");
    } else {
      info("S4", `${used} font sizes — small palette is fine, just verify hierarchy is readable`);
    }
  }

  // ── S5. color palette — fillColor / textColor utilities should cluster
  // around a small set of semantic names, not raw palette utilities
  // (bg-blue-50, text-zinc-700) sprinkled around.
  const rawPaletteHits = search(/\b(?:bg|text|border)-(?:slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950)\b/);
  if (rawPaletteHits.length === 0) {
    pass("S5", "no raw palette utilities — using semantic tokens");
  } else if (rawPaletteHits.length < 5) {
    info("S5", `${rawPaletteHits.length} raw palette utility(ies) — fine if intentional accent`);
  } else {
    warn("S5", `${rawPaletteHits.length} raw palette utilities (${rawPaletteHits[0].file}:${rawPaletteHits[0].line} → "${rawPaletteHits[0].match}")`,
      "prefer semantic tokens (bg-bg-surface, text-fg-muted, border-border) over raw palette; raw colors hard-code light-mode and break theming");
  }

  // ── S6. server-side filter discipline — list pages shouldn't filter
  // loaded rows on the client. Heuristic; advisory.
  const listFiles = sourceFiles.filter((f) => /\/(pages|routes|views)\/.*List\.tsx$/.test(f));
  const bad = [];
  for (const f of listFiles) {
    const t = fileText.get(f) || "";
    if (/\.filter\s*\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.\w+\s*[=!.]/.test(t)) {
      bad.push(relative(projectRoot, f));
    }
  }
  if (listFiles.length === 0) {
    info("S6", "no obvious list pages found yet");
  } else if (bad.length === 0) {
    pass("S6", `${listFiles.length} list page(s) — no client-side .filter() detected`);
  } else {
    warn("S6", `client-side .filter() in: ${bad.slice(0, 3).join(", ")}${bad.length > 3 ? "…" : ""}`,
      "lift filter to a server query param; client-side filter over loaded rows lies when more pages exist");
  }

  // ── S7. error-message string dispatch ────────────────────────────────
  const errHits = search(/(?:err|error|e)(?:\?)?\.message\s*(?:\.includes|\.match|\.startsWith)/);
  errHits.length === 0
    ? pass("S7", "no error.message string dispatch")
    : warn("S7", `error.message string dispatch at ${errHits[0].file}:${errHits[0].line}`,
        "define a stable error.code on the server, branch on that");

  // ── S8. shadcn primitive presence — projects can roll their own, but
  // having shadcn ui/ at all is a strong signal of intent.
  const hasShadcn = sourceFiles.some((f) => /\/components\/ui\/(button|dialog|sidebar|table)\.tsx$/.test(f));
  if (hasShadcn) {
    pass("S8", "shadcn primitives present in components/ui/");
  } else {
    info("S8", "no shadcn primitives detected — skill assumes shadcn; verify this is intentional");
  }

  // ── S9. reduced-motion — only flag if the project actually animates.
  const hasAnimations = anyMatch(/transition-(?:all|colors|transform|opacity)\b/)
    || anyMatch(/animate-(?:pulse|spin|bounce|in|out)\b/)
    || anyMatch(/duration-\d/);
  if (hasAnimations) {
    const hasRm = cssFiles.some((f) => /@media\s*\(prefers-reduced-motion\s*:\s*reduce\)/.test(fileText.get(f) || ""));
    hasRm
      ? pass("S9", "prefers-reduced-motion handled")
      : warn("S9", "project animates but has no prefers-reduced-motion override",
          "add a @media (prefers-reduced-motion: reduce) block; ideally zero out shared --dur-* tokens");
  } else {
    info("S9", "no obvious transitions/animations to gate on reduced-motion");
  }

  // ── S10. focus ring — only enforce if the project has interactive
  // elements (it always does, but the test is cheap to gate).
  const hasFocusOverride = anyMatch(/focus-visible:outline-none/);
  const hasGlobalRing = cssFiles.some((f) => /\*:focus-visible\s*\{[^}]*outline/.test(fileText.get(f) || ""));
  if (hasGlobalRing) {
    pass("S10", "global focus-visible outline present");
  } else if (hasFocusOverride) {
    warn("S10", "components suppress focus-visible outline but no global outline rule found",
      "add `*:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px }` so suppressed elements aren't keyboard-trapped");
  } else {
    info("S10", "no explicit focus-visible policy — shadcn defaults may cover this");
  }
}
function anyMatch(re) { return search(re).length > 0; }

// ────────────────────────────────────────────────────────────────────────
// RUNTIME PASS — DOM relations, no magic numbers.
//
// Browser strategy (in order of preference):
//   1. playwright (full or core, from project node_modules or global)
//   2. puppeteer / puppeteer-core (legacy, kept for backwards compat)
//
// Playwright is the recommended driver because:
//   - playwright-core ships WITHOUT downloading a browser; it can either
//     attach to a system Chrome (via CDP) or use a pre-installed
//     chromium that you opt in to with `npx playwright install chromium`.
//   - The Page API is similar enough to puppeteer that the existing
//     probe functions work unchanged.
//
// To install:
//   pnpm add -D @playwright/test    (one-time per project)
//   pnpm dlx playwright install chromium   (downloads browser ONCE,
//                                            cached at ~/.cache/ms-playwright)
// ────────────────────────────────────────────────────────────────────────
async function runRuntime() {
  let reachable = false;
  try { reachable = !!(await fetch(url, { method: "HEAD" }).catch(() => null)); } catch {}
  if (!reachable) {
    info("RT", `dev server not reachable at ${url} — runtime pass skipped (start the app then re-run with --url=...)`);
    return;
  }

  const driver = await pickDriver();
  if (!driver) {
    info(
      "RT",
      "no browser driver available — install one of:\n" +
        "         (a) playwright in this project (recommended): `pnpm add -D @playwright/test && pnpm dlx playwright install chromium`\n" +
        "         (b) puppeteer in this project: `pnpm add -D puppeteer`",
    );
    return;
  }

  try {
    await driver.goto(url);
    await driver.wait(500);
    await runRuntimeChecks(driver);
  } catch (e) {
    info("RT", `runtime pass aborted: ${e?.message ?? e}`);
  } finally {
    await driver.close().catch(() => undefined);
  }
}

/**
 * Returns a driver `{ evaluate, goto, wait, close }`. Tries playwright,
 * then puppeteer, in the project's node_modules.
 */
async function pickDriver() {
  const cwd = process.cwd();

  // 1. Playwright — preferred. playwright-core has no built-in browser
  //    download; it expects either a pre-installed chromium (via
  //    `playwright install chromium`) or a CDP endpoint from a system
  //    Chrome. Either way: zero extra bytes if you already have one.
  const playwrightSpecs = [
    "playwright",
    "playwright-core",
    "@playwright/test",
    `${cwd}/node_modules/playwright/index.js`,
    `${cwd}/node_modules/playwright-core/index.js`,
    `${cwd}/node_modules/@playwright/test/index.js`,
  ];
  for (const spec of playwrightSpecs) {
    try {
      const mod = await import(spec);
      // Both `playwright` and `playwright-core` export `chromium`.
      const chromium = mod.chromium ?? mod.default?.chromium;
      if (!chromium?.launch) continue;
      try {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        return playwrightDriver(browser, page);
      } catch (e) {
        // launch failed — typically "browser executable not found"; try next
      }
    } catch {
      // import failed; try next
    }
  }

  // 2. Puppeteer fallback — for projects that already have it.
  const puppeteerSpecs = [
    "puppeteer",
    "puppeteer-core",
    `${cwd}/node_modules/puppeteer/lib/puppeteer/puppeteer.js`,
    `${cwd}/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js`,
    `${cwd}/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js`,
  ];
  for (const spec of puppeteerSpecs) {
    try {
      const mod = await import(spec);
      const pup = mod.default ?? mod;
      if (!pup?.launch) continue;
      try {
        const browser = await pup.launch({ headless: "new", args: ["--no-sandbox"] });
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        return puppeteerDriver(browser, page);
      } catch {
        // try next
      }
    } catch {
      // try next
    }
  }

  return null;
}

function playwrightDriver(browser, page) {
  return {
    async goto(target) { await page.goto(target, { waitUntil: "load", timeout: 20000 }); },
    async wait(ms) { await page.waitForTimeout(ms); },
    async evaluate(fn) { return page.evaluate(fn); },
    async close() { await browser.close(); },
  };
}

function puppeteerDriver(browser, page) {
  return {
    async goto(target) { await page.goto(target, { waitUntil: "networkidle0", timeout: 20000 }); },
    async wait(ms) { await new Promise((r) => setTimeout(r, ms)); },
    async evaluate(fn) { return page.evaluate(fn); },
    async close() { await browser.close(); },
  };
}

async function runRuntimeChecks(driver) {
    // R1. viewport lock — relation: document height should equal viewport.
    const dim = await driver.evaluate(() => ({
      docH: document.documentElement.scrollHeight,
      viewH: window.innerHeight,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      bodyOverflow: getComputedStyle(document.body).overflow,
    }));
    const locked = dim.docH <= dim.viewH + 2;
    locked
      ? pass("R1", `viewport locked: document ${dim.docH}px ≤ viewport ${dim.viewH}px`)
      : fail("R1", `document scrolls past viewport: docH=${dim.docH} > viewH=${dim.viewH}`,
        "add `html, body, #root { height: 100%; overflow: hidden }` — the shell must not scroll");

    // R2. top-row baseline coherence — pick the top-most ~50px band and
    // measure all visible elements in it. Two failure modes:
    //  - heights differ ("h-11 nav row vs h-9 stage row")
    //  - heights match but centerY differs ("brand row gets pt-1.5 so it
    //    starts at y=6 → centerY=28, while stage row starts at y=0 →
    //    centerY=22; both are h-11 but they don't share a baseline")
    // We check BOTH — height equality is necessary, centerY equality is
    // sufficient. The visual spec is "share one baseline", which is
    // exactly centerY equality.
    const topBand = await driver.evaluate(() => {
      const els = Array.from(
        document.querySelectorAll("header, [data-sidebar='header'], aside > div:first-child, [data-slot='sidebar-header']"),
      );
      return els
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            tag: el.tagName.toLowerCase(),
            top: r.top,
            height: r.height,
            centerY: r.top + r.height / 2,
          };
        })
        .filter((e) => e.top < 50 && e.height > 20 && e.height < 80);
    });
    if (topBand.length >= 2) {
      const heights = topBand.map((e) => e.height);
      const centers = topBand.map((e) => e.centerY);
      const heightSpread = Math.max(...heights) - Math.min(...heights);
      const centerSpread = Math.max(...centers) - Math.min(...centers);
      const heightLine = heights.map((h) => h.toFixed(1)).join("/") + "px";
      const centerLine = centers.map((c) => c.toFixed(1)).join("/") + "px";
      if (heightSpread >= 2) {
        fail(
          "R2",
          `top rows have different heights: ${heightLine} (spread ${heightSpread.toFixed(1)}px)`,
          "match all top-row elements (sidebar header, stage breadcrumb, tenant switcher) with the same h-* utility — the *three top rows on one h-11 baseline* non-negotiable",
        );
      } else if (centerSpread >= 2) {
        fail(
          "R2",
          `top rows are the same height but NOT on one baseline: centers ${centerLine} (spread ${centerSpread.toFixed(1)}px, heights ${heightLine})`,
          "something between an element and its row container added vertical padding — likely pt-1.5 / pt-2 on SidebarHeader, an extra wrapper with h-* > content, or mt-* on the brand row. Find it and remove it. The brand row's h-11 must reach y=0 of the sidebar so it shares centerY with the stage row.",
        );
      } else {
        pass(
          "R2",
          `top rows on one baseline: heights ${heightLine}, centers ${centerLine} (spread ${centerSpread.toFixed(1)}px)`,
        );
      }
    } else {
      info("R2", `couldn't isolate ≥2 top-row elements (found ${topBand.length}) — skipping baseline test`);
    }

    // R3. sidebar vertical-axis alignment — collect all icons/glyphs
    // inside the sidebar; their left edges should cluster around ONE x.
    const leftEdges = await driver.evaluate(() => {
      const sidebar = document.querySelector("[data-sidebar='sidebar'], aside");
      if (!sidebar) return null;
      const sidebarLeft = sidebar.getBoundingClientRect().left;
      const els = Array.from(sidebar.querySelectorAll("svg, img, [data-icon]"));
      return els
        .map((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0) return null;
          return Math.round(r.left - sidebarLeft);
        })
        .filter((v) => v != null && v < 60);
    });
    if (leftEdges && leftEdges.length >= 3) {
      const counts = new Map();
      for (const x of leftEdges) counts.set(x, (counts.get(x) || 0) + 1);
      const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      const share = dominant[1] / leftEdges.length;
      share > 0.7
        ? pass("R3", `sidebar icons share x-axis at ${dominant[0]}px (${dominant[1]}/${leftEdges.length} icons, ${(share * 100).toFixed(0)}%)`)
        : warn("R3", `sidebar icons scattered: top axis x=${dominant[0]} only covers ${(share * 100).toFixed(0)}%`,
          "logo, tenant icon, nav-item icons should share one x — usually achieved by consistent pl-3/px-3 on every wrapper");
    } else {
      info("R3", "not enough sidebar icons found to measure x-axis alignment");
    }

    // R4. content left edge ↔ sidebar trigger axis — when the shell uses a
    // simple flat layout (trigger directly above content), page content and
    // the trigger sit on the same x-axis (typically pl-3 on both).
    //
    // FLOATING-CARD CAVEAT: with a floating-card shell, the content area is
    // inside an additional rounded card with its own padding, so the inset
    // from `main`'s left edge legitimately differs from the inset from the
    // header's left edge. Both values being on the canonical 12-px axis
    // (relative to their own parent) is what matters.
    const triggerVsContent = await driver.evaluate(() => {
      const trigger = document.querySelector("[data-sidebar='trigger'], button[aria-label*='sidebar' i]");
      const main = document.querySelector("main");
      if (!trigger || !main) return null;
      // Prefer the FIRST direct child of main (the page's outer container);
      // headings nested inside a card section sit at card-padding indents
      // that are unrelated to the page's left edge.
      const sample = main.firstElementChild;
      if (!sample) return null;
      return {
        triggerLeftInHeader: trigger.getBoundingClientRect().left - (trigger.closest("header")?.getBoundingClientRect().left ?? 0),
        contentLeftInMain: sample.getBoundingClientRect().left - main.getBoundingClientRect().left,
      };
    });
    if (triggerVsContent) {
      const t = triggerVsContent.triggerLeftInHeader;
      const c = triggerVsContent.contentLeftInMain;
      const diff = Math.abs(t - c);
      // Two valid layouts:
      //   - flat: trigger and content share the same x (12-axis)
      //   - floating-card: content fills `main` (`c ≈ 0` because the card's
      //     own padding is on `main`, not on its first child); trigger is
      //     still on the 12-axis. This is normal — `main`'s padding IS the
      //     content padding here.
      const onAxis = (n) => n >= 10 && n <= 14;
      const floatingCardOk = onAxis(t) && c < 4;
      if (diff < 4 || floatingCardOk) {
        const tag = floatingCardOk
          ? `floating-card layout (trigger=${t.toFixed(1)}, content fills main)`
          : `aligned within ${diff.toFixed(1)}px`;
        pass("R4", `trigger axis ↔ content edge: ${tag}`);
      } else if (onAxis(t) && onAxis(c)) {
        info("R4", `trigger=${t.toFixed(1)}px, content=${c.toFixed(1)}px (both on the 12-axis; floating-card layout)`);
      } else {
        warn(
          "R4",
          `trigger axis off content edge by ${diff.toFixed(1)}px (trigger=${t.toFixed(1)}, content=${c.toFixed(1)})`,
          "page content's left edge should line up with the SidebarTrigger icon (typically pl-3 on both)",
        );
      }
    }

    // R5. list rows — no visible hairline. Detect any tr with a non-zero,
    // non-transparent border-bottom. Don't care which list page.
    const rowHair = await driver.evaluate(() => {
      const trs = Array.from(document.querySelectorAll("tbody tr")).slice(0, 5);
      if (trs.length === 0) return null;
      return trs.map((tr) => {
        const td = tr.querySelector("td");
        const trCs = getComputedStyle(tr);
        const tdCs = td ? getComputedStyle(td) : null;
        const isHairline = (cs) => {
          if (!cs) return false;
          const w = parseFloat(cs.borderBottomWidth);
          if (!w) return false;
          // Treat fully-transparent borders as not-a-hairline
          const c = cs.borderBottomColor;
          return !/(?:rgba\([^)]*,\s*0\)|transparent)/.test(c);
        };
        return { tr: isHairline(trCs), td: isHairline(tdCs) };
      });
    });
    if (rowHair) {
      const hasHair = rowHair.some((r) => r.tr || r.td);
      hasHair
        ? warn("R5", "list rows have visible bottom borders",
            "tasty SaaS list rows are pills (bg-bg-surface/60 + rounded + border-spacing-y-*), not bordered rows; drop border-b on tr/td")
        : pass("R5", `${rowHair.length} sampled row(s) have no visible hairline (pill-style)`);
    } else {
      info("R5", "no list rows mounted on the landing route — visit a list page and re-run");
    }

    // R6. inactive vs active nav — they should be visually DISTINCT.
    // Don't assert "inactive is transparent"; assert "they differ".
    const navContrast = await driver.evaluate(() => {
      const sidebar = document.querySelector("[data-sidebar='sidebar'], aside");
      if (!sidebar) return null;
      const active = sidebar.querySelector("[data-active='true'], .active, [aria-current='page']");
      const inactive = Array.from(sidebar.querySelectorAll("[data-active='false'], a:not(.active):not([aria-current])"))
        .find((el) => el !== active);
      if (!active || !inactive) return null;
      const aBg = getComputedStyle(active).backgroundColor;
      const iBg = getComputedStyle(inactive).backgroundColor;
      const isTransparent = (c) => /rgba\([^)]*,\s*0\)/.test(c) || c === "transparent";
      return { activeBg: aBg, inactiveBg: iBg, distinct: aBg !== iBg, inactiveQuiet: isTransparent(iBg) };
    });
    if (navContrast) {
      if (!navContrast.distinct) {
        fail("R6", `active and inactive nav items look identical (both ${navContrast.activeBg})`,
          "decoration must follow selection — only the active item gets bg-sidebar-accent");
      } else if (!navContrast.inactiveQuiet) {
        warn("R6", `nav items distinct but inactive has resting bg (${navContrast.inactiveBg})`,
          "inactive nav should be truly transparent (use !bg-transparent to override shadcn's data-active class which fires on any value)");
      } else {
        pass("R6", `nav decoration follows selection: active=${navContrast.activeBg}, inactive=transparent`);
      }
    } else {
      info("R6", "not enough nav items to measure active/inactive contrast");
    }

    // R7. focus ring — focus any button, verify an outline appears.
    const focused = await driver.evaluate(() => {
      const btn = document.querySelector("button:not([disabled]), a[href]");
      if (!btn) return null;
      btn.focus();
      const cs = getComputedStyle(btn);
      return { w: parseFloat(cs.outlineWidth), style: cs.outlineStyle, shadow: cs.boxShadow };
    });
    if (focused) {
      const visible = focused.w >= 1 || /ring|shadow/.test(focused.shadow);
      visible
        ? pass("R7", `focus visible on first button (outline=${focused.w}px${focused.shadow !== "none" ? ", with box-shadow" : ""})`)
        : warn("R7", `focused button has no visible focus indicator`,
          "ensure `*:focus-visible { outline: ... }` is in @layer base, or use shadcn's ring-2 utility on focusable elements");
    }

    // R8. frozen header / body colgroup match — any pair of sibling-ish
    // tables where one is in an overflow:hidden container and the other
    // in overflow:auto, both having a colgroup.
    const colgroupMatch = await driver.evaluate(() => {
      const tables = Array.from(document.querySelectorAll("table"));
      const withCols = tables.filter((t) => t.querySelector("colgroup col"));
      if (withCols.length < 2) return null;
      // Pair them up: header (no tbody or empty tbody) with body
      const headers = withCols.filter((t) => !t.querySelector("tbody tr"));
      const bodies = withCols.filter((t) => t.querySelector("tbody tr"));
      if (!headers.length || !bodies.length) return null;
      const get = (t) => Array.from(t.querySelectorAll("colgroup col")).map((c) => parseFloat(getComputedStyle(c).width));
      const hCols = get(headers[0]);
      const bCols = get(bodies[0]);
      if (hCols.length !== bCols.length) return { ok: false, hCols, bCols };
      const diffs = hCols.map((w, i) => Math.abs(w - bCols[i]));
      return { ok: Math.max(...diffs) < 1, hCols, bCols, maxDiff: Math.max(...diffs) };
    });
    if (colgroupMatch) {
      colgroupMatch.ok
        ? pass("R8", `frozen header & body colgroups match (max diff ${colgroupMatch.maxDiff?.toFixed(2) || 0}px)`)
        : fail("R8", `header/body colgroups mismatch: header=[${colgroupMatch.hCols.join(",")}] body=[${colgroupMatch.bCols.join(",")}]`,
            "both tables must share an identical <colgroup> derived from the same source");
    } else {
      info("R8", "no frozen-header table pair visible on this route — visit a list page");
    }

    // R9. scrollLeft sync — find a horizontally-scrollable body with a
    // sibling-or-cousin header element; programmatically scroll and check.
    const scrollSync = await driver.evaluate(async () => {
      const all = Array.from(document.querySelectorAll("*"));
      const scrollable = all.filter((el) => {
        const cs = getComputedStyle(el);
        return (cs.overflowX === "auto" || cs.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 5;
      });
      if (scrollable.length === 0) return null;
      const body = scrollable[0];
      // Find a candidate header — overflow:hidden sibling with same scrollWidth
      const siblings = body.parentElement ? Array.from(body.parentElement.children) : [];
      const candidates = [...siblings, ...(body.parentElement?.parentElement?.children || [])].filter((el) => {
        if (el === body) return false;
        const cs = getComputedStyle(el);
        return cs.overflowX === "hidden" && el.scrollWidth > el.clientWidth + 5;
      });
      if (candidates.length === 0) return { hasBody: true, header: null };
      const header = candidates[0];
      const before = header.scrollLeft;
      body.scrollLeft = 150;
      await new Promise((r) => setTimeout(r, 80));
      const after = header.scrollLeft;
      return { hasBody: true, header: true, synced: Math.abs(after - body.scrollLeft) < 2, before, after };
    });
    if (scrollSync?.synced) pass("R9", "horizontal scroll syncs between body and frozen header");
    else if (scrollSync?.header === null) info("R9", "no frozen header pair to verify scroll sync");
    else if (scrollSync) fail("R9", `body horizontal scroll does NOT propagate to header (header=${scrollSync.after}, body=150)`,
      "wire `body.addEventListener('scroll', () => header.scrollLeft = body.scrollLeft, { passive: true })`");
    else info("R9", "no horizontally-scrollable container on this route");

    // R10. icon stroke consistency — relations, not specific value.
    const iconStrokes = await driver.evaluate(() => {
      const svgs = Array.from(document.querySelectorAll("svg"));
      const widths = new Map();
      for (const s of svgs) {
        const w = s.getAttribute("stroke-width") || getComputedStyle(s).strokeWidth;
        if (w && w !== "0") {
          const v = parseFloat(w);
          widths.set(v, (widths.get(v) || 0) + 1);
        }
      }
      return [...widths.entries()].sort((a, b) => b[1] - a[1]);
    });
    if (iconStrokes.length === 0) info("R10", "no svg icons with stroke-width — skipping");
    else if (iconStrokes.length === 1) pass("R10", `all icons share stroke-width=${iconStrokes[0][0]}`);
    else {
      const total = iconStrokes.reduce((s, [, n]) => s + n, 0);
      const topShare = iconStrokes[0][1] / total;
      topShare > 0.9
        ? pass("R10", `icon stroke dominant: ${iconStrokes[0][0]} covers ${(topShare * 100).toFixed(0)}% (${iconStrokes.length - 1} outlier(s))`)
        : warn("R10", `mixed icon strokes: ${iconStrokes.map(([v, n]) => `${v}(${n})`).join(", ")}`,
            "standardize lucide stroke-width across the app — pick one (default 2 is fine)");
    }

    // ── Dashboard relations — only fire if the page LOOKS like a dashboard
    //    (≥ 3 tile-shaped cards in a horizontal row, OR ≥ 1 svg chart).
    const dashboardSignal = await driver.evaluate(() => {
      // KPI tile heuristic: small block elements with a big number + label
      const candidates = Array.from(document.querySelectorAll("div, section, article")).filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 100 || r.width > 400 || r.height < 60 || r.height > 220) return false;
        // big value: contains a child with font-size noticeably larger than its label
        const fontSizes = Array.from(el.children).map((c) => parseFloat(getComputedStyle(c).fontSize)).filter(Boolean);
        if (fontSizes.length < 2) return false;
        const max = Math.max(...fontSizes), min = Math.min(...fontSizes);
        return max / min >= 1.4;
      });
      const charts = document.querySelectorAll(
        ".recharts-wrapper, svg.recharts-surface, [data-chart], canvas[role='img']"
      );
      return { kpiCount: candidates.length, chartCount: charts.length };
    });
    const isDashboard = dashboardSignal.kpiCount >= 3 || dashboardSignal.chartCount >= 1;

    if (isDashboard) {
      // R11. KPI row — sibling tiles share top + height (within 1px).
      const kpiRowOk = await driver.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll("div, section, article")).filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width < 100 || r.width > 400 || r.height < 60 || r.height > 220) return false;
          const fontSizes = Array.from(el.children).map((c) => parseFloat(getComputedStyle(c).fontSize)).filter(Boolean);
          if (fontSizes.length < 2) return false;
          const max = Math.max(...fontSizes), min = Math.min(...fontSizes);
          return max / min >= 1.4;
        });
        if (candidates.length < 2) return null;
        // Group by parent — siblings forming a row
        const byParent = new Map();
        for (const el of candidates) {
          const p = el.parentElement;
          if (!p) continue;
          if (!byParent.has(p)) byParent.set(p, []);
          byParent.get(p).push(el);
        }
        const groups = [...byParent.values()].filter((g) => g.length >= 2);
        if (groups.length === 0) return null;
        const row = groups.sort((a, b) => b.length - a.length)[0];
        const tops = row.map((el) => el.getBoundingClientRect().top);
        const heights = row.map((el) => el.getBoundingClientRect().height);
        return {
          n: row.length,
          topSpread: Math.max(...tops) - Math.min(...tops),
          heightSpread: Math.max(...heights) - Math.min(...heights),
        };
      });
      if (kpiRowOk) {
        const ok = kpiRowOk.topSpread < 2 && kpiRowOk.heightSpread < 2;
        ok
          ? pass("R11", `KPI row: ${kpiRowOk.n} tiles, top spread ${kpiRowOk.topSpread.toFixed(1)}px, height spread ${kpiRowOk.heightSpread.toFixed(1)}px`)
          : fail("R11", `KPI row tiles misaligned: top spread=${kpiRowOk.topSpread.toFixed(1)}px, height spread=${kpiRowOk.heightSpread.toFixed(1)}px`,
              "KPI cards must share top + height — set a fixed h-* on the wrapper, even when one card has no sparkline");
      }

      // R12. Tabular numbers on KPI values — vertical digit alignment
      // requires `font-variant-numeric: tabular-nums`. Sample big-number
      // looking elements and verify ≥ 70% of them set it.
      const tabularShare = await driver.evaluate(() => {
        const all = Array.from(document.querySelectorAll("*"));
        const big = all.filter((el) => {
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs < 22) return false;
          const text = el.textContent?.trim() || "";
          return /^[\d.,+\-%$€£¥KMB\s]+$/.test(text) && text.length > 0 && text.length < 20;
        });
        if (big.length === 0) return null;
        let tabular = 0;
        for (const el of big) {
          const fv = getComputedStyle(el).fontVariantNumeric || "";
          if (fv.includes("tabular-nums")) tabular++;
        }
        return { total: big.length, tabular, share: tabular / big.length };
      });
      if (tabularShare) {
        tabularShare.share >= 0.7
          ? pass("R12", `tabular-nums on ${tabularShare.tabular}/${tabularShare.total} big numeric values`)
          : warn("R12", `only ${tabularShare.tabular}/${tabularShare.total} big numeric values use tabular-nums`,
              "add `tabular-nums` (or `font-variant-numeric: tabular-nums`) on KPI value text so digits line up across cards");
      }

      // R13. Chart card heights — secondary charts in the same row should
      // match heights. If the page has multiple charts and they're
      // siblings in one row, their heights should cluster.
      const chartHeights = await driver.evaluate(() => {
        const charts = Array.from(document.querySelectorAll(".recharts-wrapper, svg.recharts-surface"));
        if (charts.length < 2) return null;
        // Wrapper card is usually 1-2 levels up
        const cards = charts.map((c) => {
          let el = c;
          for (let i = 0; i < 4 && el?.parentElement; i++) {
            const p = el.parentElement;
            const r = p.getBoundingClientRect();
            if (r.height > c.getBoundingClientRect().height + 40) { el = p; break; }
            el = p;
          }
          return el.getBoundingClientRect();
        });
        // Group by top (rounded to nearest 10px) to find row siblings
        const byTop = new Map();
        for (const r of cards) {
          const k = Math.round(r.top / 10) * 10;
          if (!byTop.has(k)) byTop.set(k, []);
          byTop.get(k).push(r.height);
        }
        const rows = [...byTop.values()].filter((hs) => hs.length >= 2);
        if (rows.length === 0) return null;
        return rows.map((hs) => Math.max(...hs) - Math.min(...hs));
      });
      if (chartHeights) {
        const maxSpread = Math.max(...chartHeights);
        maxSpread < 4
          ? pass("R13", `chart cards in same row share height (max spread ${maxSpread.toFixed(1)}px)`)
          : warn("R13", `chart cards in same row vary by ${maxSpread.toFixed(1)}px`,
              "row-mate chart cards should share a fixed h-* (e.g. h-56 / h-72) — varying heights make rows look broken");
      }

      // R14. Chart palette discipline — count distinct stroke/fill colors
      // on the first ~10 series-looking SVG elements; should be ≤ 5.
      const palette = await driver.evaluate(() => {
        const series = Array.from(document.querySelectorAll(
          ".recharts-line .recharts-curve, .recharts-bar-rectangle, .recharts-area-area, .recharts-pie-sector"
        )).slice(0, 30);
        if (series.length === 0) return null;
        const colors = new Set();
        for (const s of series) {
          const cs = getComputedStyle(s);
          const c = cs.stroke !== "none" ? cs.stroke : cs.fill;
          if (c && c !== "none") colors.add(c);
        }
        return [...colors];
      });
      if (palette) {
        palette.length <= 5
          ? pass("R14", `chart palette: ${palette.length} distinct color(s) across visible series`)
          : warn("R14", `${palette.length} distinct chart colors — likely too many`,
              "cap categorical series at 5; group the tail as 'Other' or use small multiples");
      }
    } else {
      info("R11–R14", "no dashboard surface detected on this route — skipping KPI/chart checks");
    }
}

// ─── main ──────────────────────────────────────────────────────────────
(async () => {
  if (!onlyRuntime) runStatic();
  if (!onlyStatic) await runRuntime();

  const counts = results.reduce(
    (acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1, acc)),
    {},
  );

  if (wantJson) {
    stdout.write(JSON.stringify({ counts, results }, null, 2) + "\n");
  } else {
    const tty = stdout.isTTY;
    const C = { pass: "\x1b[32m", fail: "\x1b[31m", warn: "\x1b[33m", info: "\x1b[2m", reset: "\x1b[0m" };
    const col = (k) => tty ? `${C[k]}${k.toUpperCase()}${C.reset}` : k.toUpperCase();
    for (const r of results) {
      console.log(`${col(r.status).padEnd(tty ? 16 : 4)}  ${r.id.padEnd(4)}  ${r.msg}`);
      if (r.hint) console.log(`         ↳ ${r.hint}`);
    }
    console.log("");
    console.log(
      `${counts.pass || 0} pass   ${counts.fail || 0} fail   ${counts.warn || 0} warn   ${counts.info || 0} info`
      + (strict ? "  (strict: warnings count as fails)" : ""),
    );
  }

  const failCount = (counts.fail || 0) + (strict ? (counts.warn || 0) : 0);
  exit(Math.min(failCount, 99));
})();
