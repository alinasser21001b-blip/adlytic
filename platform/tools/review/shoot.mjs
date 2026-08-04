#!/usr/bin/env node
/**
 * Photograph every rendered screen state at a real phone viewport.
 *
 * 390×844 with deviceScaleFactor 2, because the review must show what the app
 * looks like on a device rather than what it looks like in a wide window — and
 * because a layout that only works at desktop width is a layout that has not
 * been checked.
 */
import { chromium } from "playwright";
import { readdirSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const SRC = join(REPO, "review/screens");
const OUT = join(REPO, "review/screenshots");

if (!existsSync(SRC)) {
  console.error("review/screens is empty — run the render step first");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

/** The environment ships Chromium at a fixed path; the fallback lets the same
 *  script run on a developer machine with a normal Playwright install. */
const CANDIDATES = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium/chrome-linux/chrome",
];
const executablePath = CANDIDATES.find((p) => existsSync(p));
const browser = executablePath ? await chromium.launch({ executablePath }) : await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const files = readdirSync(SRC).filter((f) => f.endsWith(".html")).sort();
const problems = [];

for (const file of files) {
  await page.goto(pathToFileURL(join(SRC, file)).href, { waitUntil: "load" });

  // A layout that scrolls sideways on a phone is a defect, not a preference —
  // the review measures it rather than leaving it to the eye.
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) problems.push(`${file}: overflows the viewport by ${overflow}px`);

  await page.screenshot({ path: join(OUT, `${basename(file, ".html")}.png`) });
}

await browser.close();

/* What was photographed, so the dashboard can REPORT this run rather than
 * starting its own. It used to re-invoke this script as a gate, which took a
 * second full Playwright pass and — worse — rewrote every PNG *after*
 * regress.mjs had already hashed them. The images shipped in the review were
 * therefore not the images the regression gate compared. */
writeFileSync(join(REPO, "review/.shot.json"), `${JSON.stringify({
  count: files.length,
  viewport: "390×844",
  problems,
}, null, 2)}\n`);

console.log(`\nVisual review — screenshots\n`);
console.log(`  ${files.length} screen state(s) photographed at 390×844\n`);
if (problems.length) {
  for (const p of problems) console.log(`  FAIL  ${p}`);
  console.log(`\n${problems.length} layout problem(s).\n`);
  process.exit(1);
}
console.log(`  PASS  no screen overflows a phone viewport\n`);
