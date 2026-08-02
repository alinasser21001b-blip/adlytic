#!/usr/bin/env node
/**
 * Every test file on disk actually runs.
 *
 * A suite that fails to LOAD is already caught: vitest exits non-zero and the
 * review's Tests gate reports it. What nothing caught is a test file that stops
 * being collected at all — renamed out of the include glob, moved to a
 * directory the globs do not reach, or deleted in a refactor that "still
 * passes". Coverage falls, every gate stays green, and the suite reports
 * success for work it is no longer checking.
 *
 * So this compares two lists that should be identical: the test files that
 * exist, and the test files the runner actually opened. It maintains nothing —
 * both sides are derived, so it cannot drift and there is no number to update.
 */
import { execSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const PLATFORM = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The same shape vitest's `include` describes, walked from disk. */
const onDisk = (() => {
  const found = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      if (name === "node_modules" || name === "dist") continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.test\.(ts|tsx)$/.test(name) && p.includes(`${"/"}src${"/"}`)) found.push(relative(PLATFORM, p));
    }
  };
  for (const root of ["packages", "apps"]) walk(join(PLATFORM, root));
  return found.sort();
})();

/** The files the runner reported on, pass or fail. */
const collected = (() => {
  let out = "";
  try {
    out = execSync("npx vitest run --reporter=basic", { cwd: PLATFORM, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
  const seen = new Set();
  for (const m of out.matchAll(/(?:^|\s)((?:packages|apps)\/[^\s(]+\.test\.tsx?)/g)) seen.add(m[1]);
  return [...seen].sort();
})();

const missing = onDisk.filter((f) => !collected.includes(f));

console.log(`\nTest reach — every test file is actually run\n`);
console.log(`  ${onDisk.length} test file(s) on disk · ${collected.length} reported by the runner\n`);

if (missing.length) {
  for (const f of missing) console.log(`  FAIL  ${f} exists and was never collected`);
  console.log(`\n${missing.length} test file(s) exist but do not run. A suite that shrinks while passing is a suite that reports success for work it no longer checks.\n`);
  process.exit(1);
}

console.log(`  PASS  no test file exists outside the runner's reach\n`);
