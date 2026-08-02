#!/usr/bin/env node
/**
 * Rule 3 and Rule 4, enforced.
 *
 * Rule 3 — business rules belong inside the Domain layer. Never inside UI,
 *          Components, Pages, Hooks, or API Controllers.
 * Rule 4 — the UI never makes business decisions.
 *
 * Both are enforced the same way: by making the domain unable to reach
 * infrastructure, and everything else unable to re-implement a rule.
 *
 * The domain is PURE. It may not import Node built-ins, network, storage,
 * timers, randomness, or the system clock. A domain that can read a clock can
 * produce a different answer on two runs, and a rule that is not deterministic
 * is not testable — which is Rule 7.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLATFORM = resolve(HERE, "..");

const LAYERS = [
  {
    name: "domain",
    dir: "packages/domain",
    // The domain may import only itself and pure sibling types.
    allowedImports: [/^\.{1,2}\//, /^@dawai\/contracts$/],
    banned: [
      { re: /\bfrom\s+["']node:/, why: "a Node built-in — the domain must be pure" },
      { re: /\bfrom\s+["'](fs|path|crypto|http|https|net)["']/, why: "an I/O module — the domain must be pure" },
      { re: /\bfetch\s*\(/, why: "a network call — the domain must be pure" },
      { re: /\bDate\.now\s*\(/, why: "the system clock — pass an explicit instant instead (Rule 7: determinism)" },
      { re: /\bnew\s+Date\s*\(\s*\)/, why: "the system clock — pass an explicit instant instead" },
      { re: /\bMath\.random\s*\(/, why: "nondeterminism — pass an explicit value instead" },
      { re: /\bsetTimeout\s*\(|\bsetInterval\s*\(/, why: "a timer — the domain describes rules, it does not schedule" },
      { re: /\bconsole\./, why: "logging — the domain returns results, it does not report them" },
      { re: /\bprocess\.env/, why: "configuration — pass it in as a parameter" },
      { re: /\blocalStorage\.|\bwindow\.|\bdocument\.|\bnavigator\./, why: "a browser global — the domain is not a client" },
    ],
  },
  {
    // The design system may not import the domain. A token that knows a
    // business rule is a rule in the UI, which is Rule 3 inverted.
    name: "design",
    dir: "packages/design",
    allowedImports: [/^\.{1,2}\//, /^@dawai\/contracts$/],
    banned: [
      { re: /@dawai\/domain/, why: "the domain — a design token may not know a business rule (Rule 3)" },
      { re: /\bfrom\s+["']node:/, why: "a Node built-in — the design system runs on a device" },
      { re: /\bDate\.now\s*\(/, why: "the system clock — tokens are constants" },
    ],
  },
  {
    // Rule 4 — the UI never makes a business decision. A screen contract
    // declares WHAT a screen presents; it may not compute a rule.
    name: "apps",
    dir: "apps",
    allowedImports: [/^\.{1,2}\//, /^@dawai\/(design|domain|contracts)$/],
    banned: [
      { re: /\bDate\.now\s*\(/, why: "the system clock inside a contract — presentation state comes from the domain" },
      { re: /\bMath\.random\s*\(/, why: "nondeterminism in a contract" },
    ],
  },
  {
    name: "config",
    dir: "packages/config",
    allowedImports: [/^\.{1,2}\//, /^node:/, /^@dawai\/contracts$/],
    banned: [
      { re: /@dawai\/domain/, why: "the domain — configuration is read by services, never by rules" },
    ],
  },
  {
    name: "observability",
    dir: "packages/observability",
    allowedImports: [/^\.{1,2}\//, /^node:/, /^@dawai\/contracts$/],
    banned: [
      { re: /@dawai\/domain/, why: "the domain — telemetry observes, it never decides" },
    ],
  },
];

const walk = (dir, out = []) => {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ts$/.test(name)) out.push(p);
  }
  return out;
};

const problems = [];
let scanned = 0;

for (const layer of LAYERS) {
  const files = walk(join(PLATFORM, layer.dir));
  for (const file of files) {
    scanned += 1;
    const rel = relative(PLATFORM, file);
    const isTest = /\.test\.ts$/.test(file);
    const raw = readFileSync(file, "utf8");
    // Scan CODE, not prose. A comment saying "request window" is not the
    // browser global, and a checker that cannot tell the difference trains
    // people to work around it — which is worse than not having it.
    const src = raw
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));

    for (const b of layer.banned) {
      // Tests may construct instants and use the runner's globals; the rules
      // themselves may not. The ban exists to keep the RULE deterministic.
      if (isTest && /Date|Math\.random|console/.test(b.re.source)) continue;
      const m = src.match(b.re);
      if (m) {
        const line = src.slice(0, m.index).split("\n").length;
        problems.push(`${rel}:${line} — ${layer.name} layer uses ${b.why}`);
      }
    }

    for (const m of src.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
      const spec = m[1];
      if (isTest && /^vitest$/.test(spec)) continue;
      if (!layer.allowedImports.some((re) => re.test(spec))) {
        const line = src.slice(0, m.index).split("\n").length;
        problems.push(`${rel}:${line} — ${layer.name} layer may not import "${spec}"`);
      }
    }
  }
}

console.log(`\nRule 3 + Rule 4 — layer boundaries\n`);
console.log(`  ${scanned} file(s) scanned across ${LAYERS.length} layer(s)\n`);
if (problems.length) {
  for (const p of problems) console.log(`  FAIL  ${p}`);
  console.log(`\n${problems.length} violation(s). A rule outside the domain is a rule nobody can find.\n`);
  process.exit(1);
}
console.log(`  PASS  the domain is pure; no layer re-implements a rule\n`);
