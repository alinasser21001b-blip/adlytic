#!/usr/bin/env node
/**
 * Measurements, and honest gaps where a measurement is impossible here.
 *
 * The rule is absolute: a metric is reported with its measured value, or it is
 * reported as NOT VERIFIED. It is never estimated, never inferred from a
 * similar project, and never coloured green because it probably is.
 *
 * What CAN be measured without a device: source size, module count, dependency
 * shape, test wall-clock, and the rendered weight of each screen. What CANNOT:
 * startup time, frame timing, navigation latency, memory, and JS bundle size —
 * all of which need a real build on a real device.
 */
import { execSync } from "node:child_process";
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLATFORM = resolve(HERE, "../..");
const REPO = resolve(PLATFORM, "..");

const walk = (dir, test, out = []) => {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, test, out);
    else if (test(name)) out.push(p);
  }
  return out;
};

const sources = walk(join(PLATFORM, "packages"), (n) => /\.tsx?$/.test(n) && !/\.test\./.test(n))
  .concat(walk(join(PLATFORM, "apps"), (n) => /\.tsx?$/.test(n) && !/\.test\./.test(n)));
const tests = walk(join(PLATFORM, "packages"), (n) => /\.test\.tsx?$/.test(n))
  .concat(walk(join(PLATFORM, "apps"), (n) => /\.test\.tsx?$/.test(n)));

const bytes = (files) => files.reduce((n, f) => n + statSync(f).size, 0);
const lines = (files) => files.reduce((n, f) => n + readFileSync(f, "utf8").split("\n").length, 0);

/** Rendered weight per screen — a real proxy for how much DOM/view hierarchy a
 *  screen produces, measured from the review renders that exist right now. */
const screensDir = join(REPO, "review/screens");
const rendered = existsSync(screensDir)
  ? readdirSync(screensDir).filter((f) => f.endsWith(".html")).map((f) => {
      const html = readFileSync(join(screensDir, f), "utf8");
      return {
        id: f.replace(/\.html$/, ""),
        bytes: Buffer.byteLength(html),
        // Every view node the screen produces. A screen that renders 400 nodes
        // is a screen that will scroll badly on a low-end Android.
        nodes: (html.match(/<div|<span|<input/g) ?? []).length,
      };
    }).sort((a, b) => b.nodes - a.nodes)
  : [];

/** Test wall-clock, measured by running them. */
let testDuration = null;
try {
  const out = execSync("npx vitest run --reporter=basic", { cwd: PLATFORM, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  testDuration = out.match(/Duration\s+([\d.]+m?s)/)?.[1] ?? null;
} catch { testDuration = null; }

export const MEASURED = {
  source: {
    files: sources.length,
    lines: lines(sources),
    bytes: bytes(sources),
  },
  tests: {
    files: tests.length,
    lines: lines(tests),
    /** The ratio matters: a suite smaller than the code it checks is a suite
     *  that checks the happy path. */
    ratio: Number((lines(tests) / Math.max(1, lines(sources))).toFixed(2)),
    duration: testDuration,
  },
  rendered,
  heaviestScreen: rendered[0] ?? null,
};

/** Metrics that need a device build. Reported, never estimated. */
export const NOT_VERIFIED = [
  { metric: "Startup time (cold / warm)", why: "Requires a device build. No React Native binary has been produced." },
  { metric: "Render time per screen", why: "Requires the RN renderer on a device; the review renders through a DOM adapter, which measures nothing about native layout cost." },
  { metric: "Navigation latency", why: "Navigation is a pure state transition today; the perceived cost is animation and view mounting, neither of which exists yet." },
  { metric: "JS bundle size", why: "No Metro bundle has been produced. Source size is measured above and is NOT a bundle size." },
  { metric: "Memory usage", why: "Requires a device profiler." },
  { metric: "Unnecessary re-renders", why: "Requires the React profiler against a running app." },
  { metric: "Image sizes", why: "The app ships no raster assets yet." },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify({ MEASURED, NOT_VERIFIED }, null, 2));
}

export const relativeTo = (p) => relative(REPO, p);
