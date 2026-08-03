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

/* ── 3. an inert control is registered ──────────────────────────────────── */
/**
 * A handler wired to `noop` in the composition root is a control the running
 * app draws and does not honour. V2 shipped two — «الاتجاهات» and «اتصال
 * بالصيدلية» — and nothing could see them: every screen-to-SCREEN dead end is
 * machine-checked by the navigation graph, and a screen-to-DEVICE dead end is
 * invisible to it, because a dialer and a map are not screens.
 *
 * The rule is not "never use noop" — it is "an inert control must be written
 * down". A TD-N on the line or just above it ties the button to a register
 * entry, and check 2 above already proves that entry exists.
 *
 * The gallery is excluded by name: it renders every screen statically for the
 * review, so its handlers are inert BY DESIGN and none of them is a control a
 * patient can reach.
 */
const ROOT = join(PLATFORM, "apps/patient/src");
for (const file of walk(ROOT)) {
  const rel = relative(PLATFORM, file);
  if (/\.test\.|gallery\.tsx$/.test(rel)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((text, i) => {
    if (!/=\{noop\}/.test(text)) return;
    const context = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
    if (!/\bTD-\d+/.test(context))
      problems.push(`${rel}:${i + 1} renders an inert control (noop) with no TD-N naming it`);
  });
}

console.log(`\nTechnical debt register — ids unique, references resolve\n`);
console.log(`  ${seen.size} item(s) registered · ${scanned} source file(s) scanned\n`);

if (problems.length) {
  for (const p of [...new Set(problems)]) console.log(`  FAIL  ${p}`);
  console.log(`\n${problems.length} problem(s). A pointer into the register must land on exactly one thing.\n`);
  process.exit(1);
}
console.log(`  PASS  ids unique · references resolve · every inert control named\n`);
