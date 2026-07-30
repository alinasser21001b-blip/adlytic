#!/usr/bin/env node
/* ============================================================
   CORE INTEGRITY — the supervisor's gate
   ============================================================
   Run:  node tools/core-integrity.mjs [<base-ref>]     (default: the trusted tag)

   A design exploration owns the presentation layer and nothing else. This
   checks that mechanically instead of by eye, because "I did not change the
   domain" is exactly the claim a reviewer cannot verify by reading a 4,000-line
   diff.

   Two failure classes, and the second is the dangerous one:

     FROZEN     a protected domain, contract or test file was modified. The
                clinical rules, identity matching, consent semantics, security,
                data integrity and backend contracts are not the design layer's
                to touch.

     WEAKENED   a test EXPECTATION moved. A redesign that edits an assertion to
                make itself pass has not passed anything, and this is invisible
                in a green test run — the suite reports success against the new,
                weaker expectation. So assertion counts and the specific guard
                tests are compared against the base, not merely re-run.

   Exit 0 = the core is intact. Exit 1 = at least one violation, listed.
   ============================================================ */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HUB = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.argv[2] || "trusted-baseline-cc4ca1a";

const git = (...a) => execFileSync("git", a, { cwd: HUB, encoding: "utf8" }).trim();

/* Paths that belong to the trusted core. Prefix match, repo-relative. */
const FROZEN = [
  "hub/js/domain.js", "hub/js/emr.js", "hub/js/record.js", "hub/js/consent.js",
  "hub/js/network.js", "hub/js/sync.js", "hub/js/transport.js", "hub/js/assist.js",
  "hub/netlify/functions/", "hub/netlify.toml",
];

/* Suites whose expectations encode safety rules. Adding cases is fine;
   removing or rewriting them is not. */
const FROZEN_TESTS = [
  "hub/tools/test.mjs", "hub/tools/test-server.mjs", "hub/tools/test-needs.mjs",
  "hub/tools/test-e2e.mjs", "hub/tools/test-emr.mjs", "hub/tools/test-record.mjs",
  "hub/tools/test-journey.mjs", "hub/tools/test-qareeb.mjs", "hub/tools/test-ecosystem.mjs",
  "hub/tools/test-record-plane.mjs", "hub/tools/test-import.mjs",
  "hub/tools/journeys.mjs", "hub/tools/audit-ui.mjs",
];

let baseOk = true;
try { git("rev-parse", "--verify", BASE); }
catch { console.error(`base ref not found: ${BASE}`); baseOk = false; }
if (!baseOk) process.exit(2);

/* WORKING TREE, not just commits. `diff BASE...HEAD` compares the merge base to
   the last commit and is blind to anything uncommitted — which is precisely the
   state an exploration is in while it is being reviewed. A gate that can be
   defeated by "I have not committed it yet" is not a gate. */
const changed = [...new Set([
  ...git("diff", "--name-only", BASE).split("\n"),              // base → working tree
  ...git("diff", "--name-only", `${BASE}...HEAD`).split("\n"),  // base → HEAD
])].filter(Boolean);
const violations = [];
const notes = [];

for (const f of changed) {
  if (FROZEN.some((p) => f === p || f.startsWith(p)))
    violations.push(`FROZEN    ${f} — protected core; achieve this in the presentation layer instead`);
}

/* A frozen test may GAIN assertions and may not LOSE them. Counting `it(` and
   the bare assertion helpers catches both a deleted case and a gutted one. */
const countAsserts = (src) =>
  (src.match(/^\s*it\(/gm) || []).length * 1000 +
  (src.match(/\b(?:ok|no|eq)\(/g) || []).length;

for (const f of FROZEN_TESTS) {
  if (!changed.includes(f)) continue;
  let before = "";
  try { before = git("show", `${BASE}:${f}`); } catch { notes.push(`NEW TEST  ${f} — added, nothing to compare`); continue; }
  const after = existsSync(join(HUB, "..", f)) ? readFileSync(join(HUB, "..", f), "utf8") : "";
  const b = countAsserts(before), a = countAsserts(after);
  if (a < b) violations.push(`WEAKENED  ${f} — assertion weight fell ${b} → ${a}; an expectation was removed or gutted`);
  else notes.push(`grew      ${f} — assertion weight ${b} → ${a} (additions are allowed)`);
}

/* The named guards that exist because a real defect shipped. Each must still be
   present somewhere in the suite, whatever the redesign does to the screens. */
const GUARDS = [
  ["no neutral separator sits between two interpolated numbers", "bidi number reordering"],
  ["every shipped script parses", "a blank app with a green suite"],
  ["no HTML comment inside a template literal contains a backtick", "template literal termination"],
  ["every nav() call passes a key the bar can actually light", "a nav bar where the user is nowhere"],
  ["a carry code can actually be redeemed", "the consent engine's receiving end"],
];
let suite = "";
for (const f of FROZEN_TESTS) {
  const p = join(HUB, "..", f);
  if (existsSync(p)) suite += readFileSync(p, "utf8");
}
for (const [needle, why] of GUARDS)
  if (!suite.includes(needle)) violations.push(`GUARD LOST  "${needle}" — protects against ${why}`);

console.log(`core integrity · ${BASE}...HEAD · ${changed.length} files changed\n`);
for (const n of notes) console.log("  " + n);
if (notes.length) console.log("");
if (!violations.length) {
  console.log("  ✓ no protected file modified, no expectation weakened, every named guard present");
  console.log("\nCORE INTACT");
  process.exit(0);
}
for (const v of violations) console.log("  ✗ " + v);
console.log(`\n${violations.length} VIOLATION(S) — reject and return to the agent for a presentation-layer solution`);
process.exit(1);
