#!/usr/bin/env node
/**
 * Visual regression against the previous pushed build.
 *
 * The baseline is the screenshots as they exist in git HEAD, so the comparison
 * is against what was actually last reviewed rather than against a file
 * somebody remembered to update. Three outcomes per screen: unchanged, changed,
 * or new — and a changed screen is not a failure, it is something that must be
 * LOOKED AT before pushing. Silently changing a screen is the failure.
 *
 * Comparison is byte-level on the PNG. That is deliberately blunt: it cannot
 * tell a spacing change from a copy change, so it never claims to. What it can
 * do is guarantee that nothing changes without being listed.
 */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const SHOTS = join(REPO, "review/screenshots");
const STATE = join(REPO, "review/.baseline.json");

const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 12);

/** The baseline: screenshot hashes as of git HEAD. Read from git rather than
 *  from disk, so a local re-render cannot quietly become its own baseline. */
function baselineFromGit() {
  const out = {};
  let listing;
  try {
    listing = execSync("git ls-tree --name-only HEAD review/screenshots/", { cwd: REPO, encoding: "utf8" });
  } catch { return null; }
  for (const path of listing.split("\n").filter(Boolean)) {
    try {
      const buf = execSync(`git show HEAD:${path}`, { cwd: REPO, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
      out[path.split("/").pop()] = sha(buf);
    } catch { /* a file that cannot be read is treated as absent */ }
  }
  return out;
}

const baseline = baselineFromGit();
const current = {};
if (existsSync(SHOTS))
  for (const f of readdirSync(SHOTS).filter((f) => f.endsWith(".png")).sort())
    current[f] = sha(readFileSync(join(SHOTS, f)));

const report = { hasBaseline: baseline !== null && Object.keys(baseline).length > 0, added: [], removed: [], changed: [], unchanged: [] };

if (report.hasBaseline) {
  for (const [file, hash] of Object.entries(current)) {
    if (!(file in baseline)) report.added.push(file);
    else if (baseline[file] !== hash) report.changed.push(file);
    else report.unchanged.push(file);
  }
  for (const file of Object.keys(baseline)) if (!(file in current)) report.removed.push(file);
} else {
  report.added = Object.keys(current);
}

mkdirSync(dirname(STATE), { recursive: true });
writeFileSync(STATE, JSON.stringify(report, null, 2), "utf8");

console.log(`\nVisual regression — against the last pushed build\n`);
if (!report.hasBaseline) {
  console.log(`  no baseline in git yet — all ${report.added.length} screenshot(s) are new\n`);
} else {
  console.log(`  ${report.unchanged.length} unchanged · ${report.changed.length} changed · ${report.added.length} new · ${report.removed.length} removed\n`);
  for (const f of report.changed) console.log(`  CHANGED  ${f} — look at this before pushing`);
  for (const f of report.added) console.log(`  NEW      ${f}`);
  for (const f of report.removed) console.log(`  REMOVED  ${f} — a screen state that no longer renders`);
  console.log("");
}
console.log(`  Byte-level PNG comparison. It cannot say WHAT changed, only that something did.\n`);
