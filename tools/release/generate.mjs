#!/usr/bin/env node
/* Produces every human-readable release document from release-manifest.yaml.
 *
 *   node tools/release/generate.mjs           # write outputs
 *   node tools/release/generate.mjs --check   # fail if outputs are stale or
 *                                             # were hand-edited (CI mode)
 *
 * --check is the half that matters. Generating is easy; proving nobody edited
 * the generated copy is what stops a second source of truth from growing back.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseYaml } from "./yaml.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CHECK = process.argv.includes("--check");
const m = parseYaml(readFileSync(join(ROOT, "release-manifest.yaml"), "utf8"));

const BANNER = "GENERATED FROM release-manifest.yaml — DO NOT EDIT BY HAND";
const stale = [];

function emit(rel, body) {
  const p = join(ROOT, rel);
  mkdirSync(dirname(p), { recursive: true });
  const current = existsSync(p) ? readFileSync(p, "utf8") : null;
  if (current === body) return;
  if (CHECK) {
    stale.push(current === null ? `${rel} is missing` : `${rel} does not match the manifest (hand-edited or stale)`);
    return;
  }
  writeFileSync(p, body);
  console.log(`  wrote  ${rel}`);
}

const r = m.release;
const gates = Object.entries(m.verification ?? {});
const passing = gates.filter(([, g]) => g.status === "pass").length;
const applicable = gates.filter(([, g]) => g.status !== "not-applicable").length;

/* ── VERSION ───────────────────────────────────────────────────────────── */
emit("VERSION", `${r.platform}\n`);

/* ── Compatibility report ──────────────────────────────────────────────── */
// Never emitted as "Compatible" for a release whose gates are incomplete. A
// report that says Compatible over an unverified release is worse than no
// report, because it is quotable.
const complete = gates.every(([, g]) => g.status === "pass" || g.status === "not-applicable");
const verdict = m.status === "released" && complete ? "Compatible"
  : m.status === "candidate" ? "Candidate — verification incomplete"
  : `Not assessable (status: ${m.status})`;

const rows = [
  ["UI System", r.ui.supported, r.ui.minimum],
  ["API Contracts", r.api.supported, r.api.minimum],
  ...(m.clinicalContracts ?? []).map((c) => [c.name, c.supported, c.version]),
  ["Knowledge Base", r.knowledge.activeRelease, r.knowledge.activeRelease],
  ["Evidence Schema", r.knowledge.evidenceSchema, r.knowledge.evidenceSchema],
  ["Runtime Flags", m.runtimeConfiguration.featureFlags.approvedSnapshot, "—"],
];

emit(m.artifacts.compatibility, `<!-- ${BANNER} -->
# Compatibility Report — Dawai Platform ${r.platform}

Status: **${verdict}**
Manifest: \`release-manifest.yaml\` (schema ${m.schemaVersion})
Policy: ${m.governance.policyVersion}
Release: \`${m.releaseId}\` · ${m.status}
Verification: ${passing}/${applicable} gates passing

| Domain | Supported version | Current | Result |
|---|---|---|---|
${rows.map(([d, s, v]) => `| ${d} | \`${s}\` | \`${v}\` | ${complete ? "Pass" : "Pending"} |`).join("\n")}

## Governing constraint

A clinical output is valid only when code, contract, knowledge, evidence,
verification, and runtime configuration reference mutually compatible,
approved versions. Every number above is read from the manifest; none of it
is maintained by hand.
`);

/* ── Dashboard data ────────────────────────────────────────────────────── */
// The governance dashboard renders from this file. It must never carry its own
// copy of a version number, or the dashboard becomes the parallel source of
// truth the framework exists to abolish — and the one place a drift would be
// least likely to be noticed, because it is the screen people trust.
const badge = (s) => (s === "pass" ? "ok" : s === "fail" ? "bad" : "warn");
emit("dawai-site/release-data.js", `/* ${BANNER} */
window.RELEASE = ${JSON.stringify({
  releaseId: m.releaseId,
  status: m.status,
  platform: r.platform,
  policyVersion: m.governance.policyVersion,
  policyUpdatedAt: m.governance.policyUpdatedAt,
  adrs: m.governance.adrs,
  approvals: m.governance.approvals,
  knowledge: r.knowledge,
  runtime: m.runtimeConfiguration,
  versions: [
    ["Platform", r.platform.replace(/\.\d+$/, ".x"), r.platform, r.platform],
    ["UI System", r.ui.supported, r.ui.minimum, r.ui.minimum],
    ["API Contracts", r.api.supported, r.api.minimum, r.api.minimum],
    ...(m.clinicalContracts ?? []).map((c) => [c.name, c.supported, c.version, c.version]),
    ["Knowledge Base", r.knowledge.activeRelease, r.knowledge.activeRelease, r.knowledge.activeRelease],
    ["Evidence Schema", r.knowledge.evidenceSchema, r.knowledge.evidenceSchema, r.knowledge.evidenceSchema],
  ],
  contracts: m.clinicalContracts ?? [],
  flags: (m.featureFlags ?? []).map((f) => ({
    ...f,
    current: m.runtimeConfiguration.featureFlags.values?.[f.name] ?? false,
    state: f.clinicalImpact === "high" || f.clinicalImpact === "review-required" ? "warn" : "ok",
  })),
  claims: m.claims ?? [],
  verification: gates.map(([name, g]) => ({ name, ...g, badge: badge(g.status) })),
  artifacts: m.artifacts,
  gateSummary: { passing, applicable },
}, null, 1)};
`);

/* ── Release notes scaffold (created once, then owned by humans) ───────── */
const notesPath = join(ROOT, m.artifacts.releaseNotes);
if (!existsSync(notesPath) && !CHECK) {
  mkdirSync(dirname(notesPath), { recursive: true });
  writeFileSync(notesPath, `# Release Notes — Dawai Platform ${r.platform}

<!-- Prose is written by humans. Every version number below is injected from
     release-manifest.yaml at build time via {{platform}}, {{knowledge}} etc.
     Never type a version number into this file. -->

Platform {{platform}} · Knowledge {{knowledge}} · Policy {{policy}}

## What changed

## Clinical impact

## Migration

See \`${m.artifacts.migration}\`.
`);
  console.log(`  wrote  ${m.artifacts.releaseNotes} (scaffold)`);
}

/* ── Placeholder-token substitution in human-written docs ──────────────── */
// Humans write prose; the numbers are injected. This is the escape hatch that
// makes "never write a version number twice" survivable in practice.
const TOKENS = {
  "{{platform}}": r.platform,
  "{{knowledge}}": r.knowledge.activeRelease,
  "{{policy}}": m.governance.policyVersion,
  "{{releaseId}}": m.releaseId,
  "{{status}}": m.status,
};
/* Substitution skips fenced blocks and inline-code spans. A token inside
 * backticks is being QUOTED, not used — that is how a document explains which
 * tokens exist. Substituting there destroys the documentation of the feature,
 * which is exactly what happened the first time this ran.
 */
function fill(src) {
  const parts = src.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  return parts
    .map((part, i) =>
      i % 2 === 1 // odd indices are the captured code spans — leave verbatim
        ? part
        : Object.entries(TOKENS).reduce((s, [k, v]) => s.split(k).join(v), part)
    )
    .join("");
}
for (const rel of [m.artifacts.releaseNotes, m.artifacts.migration]) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) continue;
  const src = readFileSync(p, "utf8");
  const out = fill(src);
  if (out !== src && !CHECK) { writeFileSync(p, out); console.log(`  filled ${rel}`); }
}

/* ── Evidence hashes ───────────────────────────────────────────────────── */
// Reported, never auto-written. A hash the generator silently refreshes proves
// nothing — the point of the hash is that a changed report must be re-verified
// by a person, not re-stamped by a script.
const drift = [];
for (const [gate, g] of gates) {
  if (g.status !== "pass" || !g.evidence) continue;
  const p = join(ROOT, g.evidence);
  if (!existsSync(p)) { drift.push(`${gate}: evidence missing at ${g.evidence}`); continue; }
  const actual = "sha256:" + createHash("sha256").update(readFileSync(p)).digest("hex");
  if (g.evidenceHash !== actual)
    drift.push(`${gate}: set evidenceHash to ${actual}  (${g.evidence})`);
}
if (drift.length) {
  console.log("\nEvidence hashes needing a human decision:");
  for (const d of drift) console.log(`  ${d}`);
}

if (CHECK && stale.length) {
  console.error("\nGenerated outputs are out of date:\n" + stale.map((s) => `  ${s}`).join("\n"));
  console.error("\nRun: node tools/release/generate.mjs\n");
  process.exit(1);
}
if (!CHECK) console.log("\nGeneration complete.\n");
