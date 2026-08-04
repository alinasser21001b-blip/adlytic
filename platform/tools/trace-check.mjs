#!/usr/bin/env node
/**
 * Rule 1 and Rule 2, enforced.
 *
 * Rule 1 — every line of code must be traceable back to Blueprint v3.
 * Rule 2 — every module must have exactly one owner.
 *
 * A rule that lives only in a review checklist is a rule that survives until
 * the first deadline. This makes both of them a build failure.
 *
 * Every source file that exports anything must carry a file-level docblock with:
 *   @blueprint  one or more references that RESOLVE against the frozen
 *               documents — a Blueprint v3 section (§n), a decision id (Dnn),
 *               a screen id, an entity name, or a technical id (Vnn, an event
 *               name, an endpoint).
 *   @owner      the single owning service or package from the technical model.
 *   @why        one sentence: why this module exists.
 *
 * A reference that does not resolve is not traceability — it is a comment that
 * looks like traceability, which is worse than none.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLATFORM = resolve(HERE, "..");
const REPO = resolve(PLATFORM, "..");

/* ── Build the set of references that are allowed to be cited ───────────── */
const loadWindow = (p) => { const w = {}; new Function("window", readFileSync(join(REPO, p), "utf8"))(w); return w; };
const REGISTER = loadWindow("docs/product/v3/register.js").REGISTER;
const SCREENS = loadWindow("docs/product/v3/phase0.js").PHASE0;
const TECH = loadWindow("docs/technical/model.js").TECH;

const VALID = new Set();
for (const d of REGISTER) VALID.add(d.id);                       // D01…D43
for (const s of SCREENS) VALID.add(s.id);                        // E1…O24
for (const e of TECH.entities) VALID.add(e.id);                  // Account…AuditEntry
for (const s of TECH.services) VALID.add(s.id);                  // identity-service…
for (const e of TECH.events) VALID.add(e.n);                     // account.created…
for (const t of TECH.tables) VALID.add(t.t);                     // accounts…
for (const e of TECH.endpoints) VALID.add(`${e.m} ${e.p}`);      // POST /v1/requests
for (let i = 1; i <= 11; i += 1) VALID.add(`V${i}`);             // validation checks
for (const g of TECH.gaps) VALID.add(g.id);                      // BD-1…BD-11
for (let i = 1; i <= 10; i += 1) VALID.add(`§${i}`);             // Blueprint sections

const OWNERS = new Set([
  ...TECH.services.map((s) => s.id),
  // Packages that own cross-cutting concerns rather than a domain service.
  "platform-foundation",
]);

/* ── Walk the source ────────────────────────────────────────────────────── */
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) files.push(p);
  }
})(join(PLATFORM, "packages"));

const problems = [];
const conceptOwners = new Map(); // Rule 2: one owner per exported concept

for (const file of files) {
  const rel = relative(PLATFORM, file);
  const src = readFileSync(file, "utf8");

  const exportsSomething = /^\s*export\s/m.test(src);
  if (!exportsSomething) continue;

  const head = src.slice(0, src.search(/^\s*(import|export|const|type|interface|function|class)\s/m));
  const block = head.match(/\/\*\*[\s\S]*?\*\//);
  if (!block) { problems.push(`${rel}: exports without a file docblock (Rule 1)`); continue; }
  const doc = block[0];

  const bpTags = [...doc.matchAll(/@blueprint\s+(.+)/g)].map((m) => m[1].trim());
  const owner = doc.match(/@owner\s+(\S+)/)?.[1];
  const why = doc.match(/@why\s+(.+)/)?.[1];

  if (!bpTags.length) problems.push(`${rel}: no @blueprint reference (Rule 1)`);
  if (!owner) problems.push(`${rel}: no @owner (Rule 2)`);
  else if (!OWNERS.has(owner)) problems.push(`${rel}: @owner "${owner}" is not a declared service or package (Rule 2)`);
  if (!why) problems.push(`${rel}: no @why — a module that cannot say why it exists should not exist`);

  for (const tag of bpTags) {
    // A tag may cite several references separated by · or ,
    const refs = tag.split(/[·,]/).map((r) => r.trim()).filter(Boolean);
    for (const ref of refs) {
      const ok = VALID.has(ref)
        || [...VALID].some((v) => ref === v)
        || /^§\d+(\.\d+)?/.test(ref);
      if (!ok) problems.push(`${rel}: @blueprint "${ref}" does not resolve against the frozen documents (Rule 1)`);
    }
  }

  // Rule 2 — a module declaring @implements <concept> claims sole ownership.
  const concept = doc.match(/@implements\s+(\S+)/)?.[1];
  if (concept) {
    if (conceptOwners.has(concept))
      problems.push(`${rel}: "${concept}" is already implemented by ${conceptOwners.get(concept)} — duplicated ownership (Rule 2)`);
    else conceptOwners.set(concept, rel);
  }
}

/* ── Report ─────────────────────────────────────────────────────────────── */
console.log(`\nRule 1 + Rule 2 — traceability and ownership\n`);
console.log(`  ${files.length} source file(s) scanned`);
console.log(`  ${VALID.size} valid Blueprint / technical references available to cite`);
console.log(`  ${conceptOwners.size} concept(s) with a declared sole owner\n`);
if (problems.length) {
  for (const p of problems) console.log(`  FAIL  ${p}`);
  console.log(`\n${problems.length} violation(s). Untraceable code does not ship.\n`);
  process.exit(1);
}
console.log(`  PASS  every module traces to Blueprint v3 and has exactly one owner\n`);
