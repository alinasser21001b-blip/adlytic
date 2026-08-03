#!/usr/bin/env node
/**
 * Everything the project runs on is DECLARED.
 *
 * A dependency that works on the machine it was installed on and is absent
 * from package.json is the worst kind of broken: every check passes, every
 * command runs, and the repository is unusable to anybody who clones it. It
 * happened here on three packages at once, and it was found by a person trying
 * to open the app — not by anything in this repository.
 *
 *   react-native-web  installed with `--no-save` while wiring the browser
 *                     host. `npm ls` called it extraneous. A clean `npm ci`
 *                     would not have installed it, so `npm run dev` — the one
 *                     command in the startup instructions — would have failed
 *                     on the first import it tried to resolve.
 *
 *   vite, vite-node   invoked directly by `dev`, `build:web`, `review:render`
 *                     and `review:data`, and installed only because `vitest`
 *                     happens to depend on them. The dev server and the entire
 *                     review pipeline were riding on a transitive dependency
 *                     of the TEST RUNNER, free to move under them the day
 *                     vitest changed its vite major.
 *
 * Two rules, each aimed at one of those.
 */
import { readFileSync, readlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PLATFORM = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(PLATFORM, "package.json"), "utf8"));

const declared = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
]);

/** Workspace packages resolve through the workspace, not the registry. */
const isWorkspace = (name) => name.startsWith("@dawai/");

/** `node` is the runtime and `npm` is what is running the script. Everything
 *  else a script names is a package that has to be installed for it to work. */
const BUILTIN = new Set(["node", "npm", "npx"]);

const problems = [];

/**
 * Which package provides a binary — asked, not assumed.
 *
 * The first version of this rule compared the binary's NAME against the
 * declared names and immediately accused `tsc` of being undeclared: it is
 * provided by `typescript`, and a package's binaries are not obliged to share
 * its name. npm records the answer as a symlink, so this reads it rather than
 * guessing — and a lookup table of exceptions, which is how a rule like this
 * rots, never gets a chance to start.
 *
 * Null means the binary is not installed at all, which is a different and
 * worse finding than an undeclared one.
 */
function providerOf(bin) {
  try {
    const target = readlinkSync(resolve(PLATFORM, "node_modules/.bin", bin));
    // "../typescript/bin/tsc" -> typescript · "../@scope/pkg/x" -> @scope/pkg
    const parts = target.replace(/^(\.\.\/)+/, "").split("/");
    return parts[0]?.startsWith("@") ? `${parts[0]}/${parts[1]}` : (parts[0] ?? null);
  } catch {
    return null;
  }
}

/* ── Rule 1 — every binary an npm script invokes is declared ──────────── */
const invocations = [];
for (const [script, body] of Object.entries(pkg.scripts ?? {})) {
  // Split on the shell operators that begin a new command, then take the head
  // word of each. Crude on purpose: a script complicated enough to defeat this
  // is a script that should be a file in tools/.
  for (const part of String(body).split(/&&|\|\||[;|]/)) {
    const head = part.trim().split(/\s+/)[0];
    if (!head || BUILTIN.has(head)) continue;
    // `npm run x` recurses into another script rather than naming a binary.
    if (head === "run") continue;
    invocations.push({ bin: head, script });
  }
}

const seen = new Set();
for (const { bin, script } of invocations) {
  if (seen.has(bin)) continue;
  seen.add(bin);

  const provider = providerOf(bin);
  if (provider === null) {
    problems.push(`script "${script}" runs \`${bin}\`, which is not installed at all`);
    continue;
  }
  if (declared.has(provider)) continue;
  problems.push(
    `script "${script}" runs \`${bin}\`, provided by "${provider}", which no dependency declares`
    + " — it is installed only because something else happens to depend on it",
  );
}

/* ── Rule 2 — every module a build alias points AT is declared ────────── */
/*
 * An alias is an import that no import statement contains, so nothing that
 * scans source files can see it. `"react-native": "react-native-web"` is how
 * the browser host works and the only place that name appears in the entire
 * repository — which is precisely why it went missing for a day.
 */
const configs = ["apps/patient/vite.config.ts", "tools/review/vite.config.ts"];
let aliasesChecked = 0;
for (const rel of configs) {
  let src;
  try { src = readFileSync(resolve(PLATFORM, rel), "utf8"); } catch { continue; }
  const alias = src.match(/alias:\s*\{([\s\S]*?)\n\s*\},/);
  if (!alias) continue;
  // A bare package name on the right-hand side. Paths (./ ../ /) are files,
  // not packages, and resolve without anything being installed.
  for (const m of alias[1].matchAll(/["'][^"']+["']\s*:\s*["']([^"'./][^"']*)["']/g)) {
    const target = m[1];
    aliasesChecked += 1;
    if (isWorkspace(target) || declared.has(target)) continue;
    problems.push(`${rel} aliases to "${target}", which no dependency declares`);
  }
}

console.log(`\nDependencies — everything the project runs on is declared\n`);
console.log(`  ${declared.size} declared · ${seen.size} script binary/binaries · ${aliasesChecked} build alias(es)\n`);

if (problems.length) {
  for (const p of problems) console.log(`  FAIL  ${p}`);
  console.log(`\n${problems.length} problem(s). A clean clone would not build.\n`);
  process.exit(1);
}

console.log(`  PASS  every script binary and build alias resolves to a declared dependency\n`);
