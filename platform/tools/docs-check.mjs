#!/usr/bin/env node
/**
 * No generated document may print a hole where a value should be.
 *
 * A template that reads a key nobody set renders the word `undefined` into a
 * shipped document, and it stays there until a human happens to scroll past
 * it. That happened: DESIGN_FIDELITY_REPORT.md published "### CLR-7 —
 * undefined" because one hand-written record spelled `question` where every
 * other spelled `title`, and four deviation records spelled `designApproval`
 * where the shape says `designApproved`.
 *
 * The fidelity generator now validates its own records, which names the field
 * precisely. This is the wider net: whatever a generator forgets to check, a
 * hole in its OUTPUT is still caught, for every generated document at once.
 * Cheap, total, and impossible to drift — it reads the artefacts themselves.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const PLATFORM = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(PLATFORM, "..");

/** Generated artefacts. Hand-written prose is excluded: an author may legitimately
 *  discuss the word, and this must not police English. */
const GENERATED = [
  "docs/design/DESIGN_FIDELITY_REPORT.md",
  "docs/design/RESPONSIVE_REPORT.md",
  "docs/design/SCREEN_INVENTORY.md",
  "docs/design/COMPONENT_INVENTORY.md",
  "docs/design/DESIGN_TOKENS.md",
  "docs/design/DIAGRAMS.md",
];

/**
 * The holes a template leaves. `undefined` and `NaN` are values that escaped;
 * `[object Object]` is a structure stringified where a field was meant.
 * "null" is deliberately NOT here — a report may legitimately say a value is
 * null, and banning it would be policing content rather than defects.
 */
const HOLES = [
  [/\bundefined\b/, "undefined — a template read a key nobody set"],
  [/\bNaN\b/, "NaN — a computation divided by nothing"],
  [/\[object Object\]/, "[object Object] — a structure was stringified where a field was meant"],
];

const problems = [];
let scanned = 0;

for (const rel of GENERATED) {
  const path = join(REPO, rel);
  let text;
  try {
    if (!statSync(path).isFile()) continue;
    text = readFileSync(path, "utf8");
  } catch {
    // A document listed here and absent means the generator did not run. That
    // is worth failing on: the dashboard would show a stale one.
    problems.push(`${rel} — listed as generated but missing; run npm run design`);
    continue;
  }
  scanned += 1;
  const lines = text.split("\n");
  for (const [re, why] of HOLES) {
    for (let i = 0; i < lines.length; i += 1) {
      // Skip fenced code and inline code: a document may quote the literal.
      if (/^\s*```/.test(lines[i])) continue;
      const bare = lines[i].replace(/`[^`]*`/g, "");
      if (re.test(bare)) problems.push(`${rel}:${i + 1} — ${why}`);
    }
  }
}

console.log(`\nGenerated documents — no holes\n`);
console.log(`  ${scanned} document(s) scanned\n`);

if (problems.length) {
  for (const p of problems) console.log(`  FAIL  ${p}`);
  console.log(`\n${problems.length} hole(s). A document that ships the word "undefined" is a document nobody generated on purpose.\n`);
  process.exit(1);
}

console.log(`  PASS  no generated document prints undefined, NaN or [object Object]\n`);
