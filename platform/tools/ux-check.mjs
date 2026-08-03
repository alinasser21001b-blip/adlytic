#!/usr/bin/env node
/**
 * UX as a first-class engineering responsibility, enforced.
 *
 * A screen contract is only worth having if something checks it against the
 * frozen Blueprint. This tool does three things no reviewer reliably does:
 *
 *   1. Every declared contract names a screen that EXISTS in Blueprint v3.
 *      Improving UX must never quietly add a screen.
 *   2. Every state Blueprint v3 declares for a screen has a treatment in the
 *      contract. A screen that ships a happy path and discovers the rest in
 *      production is the practice the Blueprint's own inventory exists to end.
 *   3. Every exit resolves to a real screen, and no screen is a dead end.
 *      A navigation trap is a graph property, not an opinion.
 *
 * Run: node tools/ux-check.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLATFORM = resolve(HERE, "..");
const REPO = resolve(PLATFORM, "..");

const loadWindow = (p) => { const w = {}; new Function("window", readFileSync(join(REPO, p), "utf8"))(w); return w; };
const SCREENS = loadWindow("docs/product/v3/phase0.js").PHASE0;
const byId = new Map(SCREENS.map((s) => [s.id, s]));

/* ── Collect declared contracts ─────────────────────────────────────────── */
const contractFiles = [];
(function walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.contract\.ts$/.test(name)) contractFiles.push(p);
  }
})(join(PLATFORM, "apps"));

const problems = [];
const declared = new Map(); // screenId -> file

/**
 * Contracts are read statically rather than executed. A checker that imports
 * app code inherits the app's dependencies and stops running in CI the first
 * time one of them needs a native module.
 */
for (const file of contractFiles) {
  const rel = relative(PLATFORM, file);
  const src = readFileSync(file, "utf8");

  const ids = [...src.matchAll(/^\s*id:\s*"([^"]+)"/gm)].map((m) => m[1]);
  if (!ids.length) { problems.push(`${rel}: declares no screen id`); continue; }

  for (const id of ids) {
    if (!byId.has(id)) {
      problems.push(`${rel}: contract for "${id}", which is not a Blueprint v3 screen — improving UX may not add a screen`);
      continue;
    }
    if (declared.has(id))
      problems.push(`${rel}: screen "${id}" already has a contract in ${declared.get(id)} — one owner per screen (Rule 2)`);
    else declared.set(id, rel);
  }

  // Blueprint states must each have a treatment. The Blueprint's state column
  // is the authority; the contract may add treatments but never drop one.
  for (const id of ids) {
    const screen = byId.get(id);
    if (!screen) continue;
    const required = String(screen.st)
      .split("·").map((s) => s.trim().toLowerCase()).filter((s) => s && s !== "—");
    const block = sliceContract(src, id);
    for (const state of required) {
      const kind =
        state.includes("empty") || state.includes("quiet") ? "empty"
        : state.includes("loading") ? "loading"
        : state.includes("error") ? "error"
        : state.includes("offline") ? "offline"
        : state.includes("permission") ? "permissionRefused"
        : null;
      if (kind && !new RegExp(`kind:\\s*"${kind}"`).test(block))
        problems.push(`${rel}: screen "${id}" declares state "${state}" in Blueprint v3 but has no ${kind} treatment`);
    }
  }
}

/** Extract the object literal for one screen id, so state checks are per-screen. */
function sliceContract(src, id) {
  const start = src.indexOf(`id: "${id}"`);
  if (start === -1) return "";
  const next = src.slice(start + 1).search(/^\s*id:\s*"/m);
  return next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
}

/* ── Dead ends and unreachable screens, as a graph ──────────────────────── */
const exits = new Map();
for (const file of contractFiles) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/id:\s*"([^"]+)"/g)) {
    const block = sliceContract(src, m[1]);
    const list = block.match(/exits:\s*\[([^\]]*)\]/);
    exits.set(m[1], list ? [...list[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : []);
  }
}
for (const [id, targets] of exits) {
  for (const t of targets)
    if (!byId.has(t) && !declared.has(t))
      problems.push(`screen "${id}" exits to "${t}", which is not a Blueprint v3 screen`);
  // An `id:` in a *.contract.ts file that is not a declared screen used to
  // crash here with a bare ERR_INVALID_ARG_TYPE from node:path — a stack trace
  // instead of a sentence, on a gate whose whole job is to say what is wrong.
  // A gate that dies is a gate nobody can act on, so it reports instead.
  const file = declared.get(id);
  if (!file) {
    problems.push(`"${id}" is declared with an id: in a *.contract.ts file but is not a Blueprint v3 screen — if it is not a screen contract, do not name the file *.contract.ts`);
    continue;
  }
  const back = /back:\s*\{\s*kind:\s*"none"/.test(sliceContract(
    readFileSync(join(PLATFORM, file), "utf8"), id));
  if (targets.length === 0 && back)
    problems.push(`screen "${id}" has no exit and no back — a navigation trap`);
}

/* ── Report ─────────────────────────────────────────────────────────────── */
console.log(`\nUX contracts — Blueprint v3 conformance\n`);
console.log(`  ${SCREENS.length} screens in Blueprint v3 Phase 0`);
console.log(`  ${declared.size} with a declared UX contract`);
console.log(`  ${contractFiles.length} contract file(s)\n`);

if (!contractFiles.length) {
  console.log(`  PASS  no contracts declared yet — Stage 6 has not begun\n`);
  process.exit(0);
}
if (problems.length) {
  for (const p of problems) console.log(`  FAIL  ${p}`);
  console.log(`\n${problems.length} violation(s). A screen that confuses the user is not finished.\n`);
  process.exit(1);
}
console.log(`  PASS  every contract matches a Blueprint screen, covers its states, and has no dead end\n`);
