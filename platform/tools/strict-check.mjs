#!/usr/bin/env node
/**
 * The compiler settings are load-bearing, so they are checked like any rule.
 *
 * `noImplicitReturns` alone is what makes nine switches over discriminated
 * unions exhaustive — including the one that renders a screen's state
 * treatment. Nothing said so anywhere, and nothing stopped a package from
 * turning it off in its own tsconfig or forgetting to extend the base at all.
 * A project that loses a flag does not fail; it quietly starts accepting code
 * the rest of the repository is written to assume is impossible.
 *
 * Two properties:
 *   1. every project tsconfig extends the base — a new package that forgets is
 *      a package with none of these settings;
 *   2. no project weakens a required flag, and the base declares all of them.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const PLATFORM = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Each with what it actually buys, so removing one is an argued decision. */
const REQUIRED = {
  strict: "the whole point",
  noUncheckedIndexedAccess: "an array index can miss; `hits[0]` is possibly undefined",
  exactOptionalPropertyTypes: "an absent field and a field set to undefined are different",
  noImplicitReturns: "what makes every switch over a union exhaustive",
  noFallthroughCasesInSwitch: "a missing break is a bug, not a style",
  noImplicitOverride: "an override that stops overriding is silent otherwise",
  noUnusedLocals: "dead code is found at the moment it becomes dead",
  noUnusedParameters: "a parameter nobody reads is a contract nobody keeps",
  useUnknownInCatchVariables: "a caught value is unknown until it is checked",
  verbatimModuleSyntax: "a type import that emits is a runtime dependency nobody chose",
  isolatedModules: "every file must stand alone, because the bundler compiles them that way",
  forceConsistentCasingInFileNames: "a case-insensitive filesystem hides a broken import",
};

const read = (p) => JSON.parse(readFileSync(p, "utf8").replace(/^\s*\/\/[^\n]*$/gm, ""));
const problems = [];

const found = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/^tsconfig(\..+)?\.json$/.test(name)) found.push(p);
  }
})(PLATFORM);

const BASE = join(PLATFORM, "tsconfig.base.json");
const base = read(BASE).compilerOptions ?? {};
for (const [flag, why] of Object.entries(REQUIRED))
  if (base[flag] !== true) problems.push(`tsconfig.base.json does not set ${flag} — ${why}`);

for (const file of found) {
  const rel = relative(PLATFORM, file);
  if (rel === "tsconfig.base.json") continue;
  const cfg = read(file);
  const options = cfg.compilerOptions ?? {};
  // The solution-style root lists references only; it compiles nothing itself.
  // A solution-style root lists references and compiles nothing itself; the
  // conventional marker is `files: []`, which is an empty ARRAY and therefore
  // truthy — the first version of this check tested `!cfg.files` and reported
  // the root as unprotected.
  const isSolution = Array.isArray(cfg.references) && !cfg.include
    && (cfg.files === undefined || (Array.isArray(cfg.files) && cfg.files.length === 0));
  if (!cfg.extends && !isSolution)
    problems.push(`${rel} does not extend tsconfig.base.json, so none of the required flags apply to it`);
  for (const flag of Object.keys(REQUIRED))
    if (options[flag] === false) problems.push(`${rel} turns ${flag} OFF — ${REQUIRED[flag]}`);
}

/* ── every project is actually built ────────────────────────────────────── */
/**
 * A project the root does not reference is a project `tsc -b` never compiles.
 * Its tests still run — vitest transpiles without typechecking — so the package
 * would be shipped un-typechecked while every gate stayed green. That is the
 * same failure as losing a flag, arrived at from the other side.
 */
const root = read(join(PLATFORM, "tsconfig.json"));
const referenced = new Set((root.references ?? []).map((r) => r.path.replace(/\/$/, "")));
for (const file of found) {
  const rel = relative(PLATFORM, file);
  if (rel === "tsconfig.base.json" || rel === "tsconfig.json") continue;
  const project = dirname(rel);
  if (!referenced.has(project))
    problems.push(`${project} is not referenced by the root tsconfig, so tsc -b never compiles it`);
}

/* ── every TypeScript file belongs to a project ─────────────────────────── */
/**
 * A file outside every project is a file the compiler never opens.
 *
 * `tools/` was exactly that: five .tsx files — the review renderer, the RN-web
 * shim, the gallery, the data generator, the test double — with no tsconfig
 * anywhere above them. A deliberately broken file compiled clean, and the
 * three real errors hiding there included one that would have crashed the
 * renderer mid-run.
 *
 * The check above asks whether every project is referenced; this asks the
 * question from the other side, which is the one that found it: whether every
 * file is in a project at all.
 */
const projectRoots = [...referenced].map((r) => join(PLATFORM, r));
/**
 * Files a project names explicitly rather than owning by location. A config at
 * the repository root belongs to no directory but is still compiled when a
 * project lists it — `vitest.config.ts` decides what every test imports, so it
 * being unchecked was worth fixing rather than excusing.
 */
const alsoIncluded = new Set();
for (const root of projectRoots) {
  let cfg;
  try { cfg = read(join(root, "tsconfig.json")); } catch { continue; }
  for (const pattern of cfg.include ?? [])
    if (!pattern.includes("*")) alsoIncluded.add(resolve(root, pattern));
}
const orphans = [];
(function scan(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith("dist-")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) scan(p);
    else if (/\.tsx?$/.test(name)
      && !projectRoots.some((root) => p.startsWith(`${root}/`))
      && !alsoIncluded.has(p))
      orphans.push(relative(PLATFORM, p));
  }
})(PLATFORM);
for (const o of orphans)
  problems.push(`${o} is not inside any referenced project, so the compiler never opens it`);

console.log(`\nCompiler strictness — the flags the code is written to assume\n`);
console.log(`  ${Object.keys(REQUIRED).length} required flag(s) · ${found.length} tsconfig(s) · ${referenced.size} project(s) built · ${orphans.length} orphan file(s)\n`);

if (problems.length) {
  for (const p of problems) console.log(`  FAIL  ${p}`);
  console.log(`\n${problems.length} problem(s). A rule that can be switched off in one file is not a rule.\n`);
  process.exit(1);
}
console.log(`  PASS  every project extends the base and no flag is weakened\n`);
