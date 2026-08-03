#!/usr/bin/env node
/**
 * The debt register is hand-authored, so its two structural properties are
 * checked rather than assumed.
 *
 * 1. Ids are unique. The id is how an item is referenced from a code comment
 *    or a commit message, so two items sharing one is worse than an unnumbered
 *    item: a reader following "see TD-10" lands on whichever the register
 *    happens to list first. This happened — two items were added to a
 *    hand-kept list without checking what was already in it.
 *
 * 2. Every TD-N named in source exists. A reference to an item that was
 *    renumbered or removed points at nothing, and the reader cannot tell
 *    whether the debt was paid or the pointer rotted.
 *
 * Runs in `npm run check`, not only in the review build, because a stale
 * cross-reference is exactly the kind of thing that survives until someone
 * follows it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { DEBT, RESOLVED } from "./review/debt.mjs";

const PLATFORM = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];

/* ── 1. unique ids ──────────────────────────────────────────────────────── */
const seen = new Set();
for (const { id } of [...DEBT, ...RESOLVED]) {
  if (seen.has(id)) problems.push(`${id} is used by more than one register entry`);
  seen.add(id);
}

/* ── 2. every reference resolves ────────────────────────────────────────── */
const walk = (dir, out = []) => {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|mjs)$/.test(name)) out.push(p);
  }
  return out;
};

let scanned = 0;
for (const dir of ["apps", "packages"]) {
  for (const file of walk(join(PLATFORM, dir))) {
    scanned += 1;
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/\bTD-\d+[a-z]?\b/g))
      if (!seen.has(m[0]))
        problems.push(`${relative(PLATFORM, file)} refers to ${m[0]}, which is not in the register`);
  }
}

console.log(`\nTechnical debt register — ids unique, references resolve\n`);
console.log(`  ${seen.size} item(s) registered · ${scanned} source file(s) scanned\n`);

if (problems.length) {
  for (const p of [...new Set(problems)]) console.log(`  FAIL  ${p}`);
  console.log(`\n${problems.length} problem(s). A pointer into the register must land on exactly one thing.\n`);
  process.exit(1);
}
console.log(`  PASS  every id is unique and every TD-N named in source exists\n`);
