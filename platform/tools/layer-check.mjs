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
    // observability is on the list because an app EMITS telemetry; it may name
    // an event from the closed set and may not invent one, which is the same
    // reason the set is closed in the first place. react and react-native are
    // the app's rendering platform — and NOTHING else is, so a screen cannot
    // reach for a state library that would let a rule live in a component.
    allowedImports: [
      /^\.{1,2}\//,
      /^@dawai\/(design|domain|navigation|session|offline|net|contracts|observability)$/,
      /^react$/, /^react-native$/,
      /^(vitest|react-test-renderer)$/,
    ],
    banned: [
      { re: /\bDate\.now\s*\(/, why: "the system clock inside a contract — presentation state comes from the domain" },
      // The strongest possible defeat of the type system, and it is almost
      // never load-bearing. The one in the codebase — the outbox payload in
      // send.ts — compiled fine without it: someone had written `as unknown
      // as` to silence an error that no longer existed, and it stayed,
      // covering the one value in the product that leaves the device.
      { re: /\bas unknown as\b/, why: "a double cast — it defeats the type system entirely; if a value genuinely needs reshaping, reshape it", testsMayUse: true },
      { re: /\bMath\.random\s*\(/, why: "nondeterminism in a contract" },
      // §25 names this hazard by name: a physical direction paired with an RTL
      // container double-reverses, and the back button ends up on the wrong
      // edge. `row` already means right-to-left under RTL — it broke the
      // header the first time it was rendered.
      { re: /row-reverse/, why: "a physical row direction — under RTL `row` already runs right-to-left, and reversing it flips the layout back (§25)" },
      { re: /(left|right):\s*\d/, why: "a physical edge — use start/end via resolveEdge (§25)" },
      // §25 fixes tracking at zero because Arabic is connected, and TypeStyle
      // types it `0` so no role can hold anything else. A literal at a call
      // site goes around that type entirely — which is exactly how `letterSpacing:
      // 2` got into the code field. The exception is real (a code is LTR digits,
      // not Arabic text) but it is one token, `tracking.tabularCode`, so a reader
      // can tell the exception from a violation without measuring the render.
      // A component declared inside another component's body is a new
      // component TYPE on every render: React cannot match it to the previous
      // tree, so it unmounts and remounts the whole subtree, discarding state
      // and restarting animations. `Wedge` lived inside `Dial` and was rebuilt
      // once a second by R7's countdown. Indented `const Name = (` with a
      // capital is the shape — module-level declarations start at column 0.
      { re: /\n[ \t]+const [A-Z][A-Za-z0-9]*\s*=\s*\(/, why: "a component declared inside another component — it is a new type every render, so React remounts the subtree and discards its state" },
      // How far a movement moves is a design decision, exactly like how long
      // it takes. Duration and easing were tokens while the magnitudes — the
      // 8pt enter rise, the 0.35 pulse floor, the 6pt shake throw — were
      // literals in an interpolation, with §27 rule 2 quoted beside one of
      // them in a comment. A decision that lives in a comment beside a number
      // cannot be changed in one place or checked in any.
      { re: /outputRange:\s*\[\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*\]/, why: "a raw motion magnitude — name a MAGNITUDE token instead (§27 rule 2)" },
      { re: /letterSpacing:\s*[1-9]/, why: "a tracking literal — Arabic is connected and §25 fixes spacing at zero; the one exception is design's `tracking` token" },
    ],
  },
  {
    /**
     * A screen composes; it does not draw.
     *
     * The design implementation framework is only worth having if a screen
     * CANNOT go around it, and the sharpest available line is the rendering
     * platform itself: a screen that cannot import `View` cannot type a
     * `flexDirection`, cannot invent a gap outside the 4pt scale, cannot
     * hand-roll a fifth copy of a card, and cannot build a control without a
     * name. Everything visual arrives from ../ui — which is measured by the
     * contrast gate, photographed by the gallery, and counted by the component
     * inventory.
     *
     * Before this rule the eight screens between them held nine copies of one
     * baseline row, five wrapped action clusters, four sunken notes, four
     * spacers and four hand-rolled cards. None of those was a decision anybody
     * made; each was a call site that had nowhere else to go.
     */
    name: "screens",
    dir: "apps/patient/src/screens",
    allowedImports: [
      /^\.{1,2}\//,
      /^@dawai\/(design|domain|navigation|session|offline|net|contracts|observability)$/,
      /^react$/,
      /^(vitest|react-test-renderer)$/,
    ],
    banned: [
      // A screen presents; the store dispatches. Screens used to import GRAPH
      // and isBuilt from app/store.ts — the module that owns every intent, the
      // effect list and the reducer — to answer a question about the CONTRACTS.
      // Those answers live beside the contracts now, and this keeps the
      // dependency running one way: the store may read the screens' contracts,
      // the screens may not read the store.
      { re: /from\s+["']\.\.\/app\/store/, why: "the composition root — a screen may not import the reducer; contract facts live in screens/graph.ts" },
      // Motion is a token or it is not motion. A duration typed at a call site
      // is a ninth animation nobody approved, respecting nobody's reduced-motion
      // setting and teaching nothing — §27 requires every movement to answer
      // "what does this teach?", and a raw number answers nothing.
      // Both forms, because they are the same mistake: `duration: 350` in a
      // style object and `delay={200}` on a component. The first version of
      // this rule caught only the object key and let the JSX prop through,
      // which the negative test found immediately.
      { re: /\b(duration|delay)\s*[:=]\s*\{?\s*\d/, why: "a raw animation duration — name a motion token instead (§27)" },
      { re: /\bAnimated\./, why: "a hand-driven animation — compose ../ui/motion instead (§27)" },
    ],
  },
  {
    // Navigation presents; it never decides. It may ask the domain for an
    // answer but may not compute a rule — Rule 4.
    name: "navigation",
    dir: "packages/navigation",
    allowedImports: [/^\.{1,2}\//, /^@dawai\/(design|domain|contracts)$/],
    banned: [
      { re: /\bDate\.now\s*\(/, why: "the system clock — navigation is deterministic" },
      { re: /\bMath\.random\s*\(/, why: "nondeterminism — a deep-linked stack must be identical every time" },
    ],
  },
  {
    // The outbox and the retry policy are pure state machines over time that
    // the CALLER supplies, for the same reason the domain is: a retry schedule
    // that reads a clock cannot be tested.
    name: "offline",
    dir: "packages/offline",
    allowedImports: [/^\.{1,2}\//],
    banned: [
      { re: /\bDate\.now\s*\(/, why: "the system clock — queuedAt is supplied by the caller" },
      { re: /\bfetch\s*\(/, why: "a network call — the outbox describes work, it does not send it" },
    ],
  },
  {
    name: "net",
    dir: "packages/net",
    allowedImports: [/^\.{1,2}\//],
    banned: [
      { re: /\bMath\.random\s*\(/, why: "nondeterminism — jitter takes an explicit random source" },
      { re: /\bfetch\s*\(/, why: "a network call — this package is policy, not transport" },
    ],
  },
  {
    name: "session",
    dir: "packages/session",
    allowedImports: [/^\.{1,2}\//],
    banned: [
      { re: /\bDate\.now\s*\(/, why: "the system clock — startedAt is supplied by the caller" },
      { re: /\blocalStorage\./, why: "storage — the session is a value; persisting it is infrastructure" },
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
    else if (/\.tsx?$/.test(name)) out.push(p);
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
    const isTest = /\.test\.tsx?$/.test(file);
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
      // Some bans are about production code only: a test may legitimately
      // build a malformed value to prove the code rejects it.
      if (isTest && b.testsMayUse) continue;
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

/* Build output must never sit beside a source file. A stale emitted .js next
 * to its .ts resolves FIRST in the test runner, so every test silently runs
 * against the previous build — the tests pass while the code is wrong, which
 * is the worst failure mode a suite can have. Found the hard way. */
for (const dir of ["packages", "apps"]) {
  for (const f of walk(join(PLATFORM, dir))) {
    const rel = relative(PLATFORM, f);
    if (!rel.includes("/src/")) continue;
  }
}
const strays = [];
(function findStrays(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) findStrays(p);
    else if (/\.(js|d\.ts|js\.map|d\.ts\.map)$/.test(name) && p.includes("/src/"))
      strays.push(relative(PLATFORM, p));
  }
})(join(PLATFORM, "packages"));
(function findStrays2(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) findStrays2(p);
    else if (/\.(js|d\.ts|js\.map|d\.ts\.map)$/.test(name) && p.includes("/src/"))
      strays.push(relative(PLATFORM, p));
  }
})(join(PLATFORM, "apps"));
for (const s of strays)
  problems.push(`${s} — build output beside a source file; the test runner resolves it FIRST and every test runs against a stale build`);

console.log(`\nRule 3 + Rule 4 — layer boundaries\n`);
console.log(`  ${scanned} file(s) scanned across ${LAYERS.length} layer(s)\n`);
if (problems.length) {
  for (const p of problems) console.log(`  FAIL  ${p}`);
  console.log(`\n${problems.length} violation(s). A rule outside the domain is a rule nobody can find.\n`);
  process.exit(1);
}
console.log(`  PASS  the domain is pure; no layer re-implements a rule\n`);
