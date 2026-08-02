#!/usr/bin/env node
/**
 * Generate docs/design/SCREEN_INVENTORY.md from the code.
 *
 * The screen inventory is the one design document that must never be written
 * by hand. It is derived from Blueprint v3's own screen list, the screen
 * contracts, the shared screen registry and the navigation graph — the same
 * four sources the application runs on. A hand-maintained inventory would
 * disagree with the build within one slice, and a designer working from a
 * stale list designs screens that do not exist and misses states that do.
 *
 * Run: npm run design:inventory
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");

const data = JSON.parse(readFileSync(join(REPO, "review/data.json"), "utf8"));

const w = {};
new Function("window", readFileSync(join(REPO, "docs/product/v3/phase0.js"), "utf8"))(w);
const PHASE0 = w.PHASE0;

const contracted = new Map(data.screens.map((s) => [s.id, s]));
const shotsFor = (id) => data.shots.filter((s) => s.screen === id);

/** Blueprint state vocabulary → the treatment kind the app implements. */
const STATE_MAP = {
  loading: "loading", empty: "empty", quiet: "empty (success variant)",
  error: "error", offline: "offline", "permission-refused": "permissionRefused",
  stale: "offline (age-labelled)", expired: "error", expiring: "warning treatment",
  refused: "error", closed: "informational", paused: "informational",
  "no-match": "empty", mismatch: "error", "rate-limited": "error",
  "two-step": "confirmation", "per reason": "error (varies by reason)",
};

const groups = [...new Set(PHASE0.map((s) => s.g))];

const statusOf = (s) => {
  const c = contracted.get(s.id);
  if (!c) return "NOT IMPLEMENTED";
  return shotsFor(s.id).length > 0 ? "IMPLEMENTED + RENDERED" : "CONTRACTED, NOT RENDERED";
};

const rows = [];
for (const g of groups) {
  rows.push(`\n### ${g}\n`);
  rows.push("| Screen | Name | Purpose | Blueprint states | Status | Designed states required |");
  rows.push("| --- | --- | --- | --- | --- | --- |");
  for (const s of PHASE0.filter((x) => x.g === g)) {
    const declared = String(s.st).split("·").map((x) => x.trim()).filter((x) => x && x !== "—");
    const required = declared.length
      ? declared.map((d) => STATE_MAP[d] ?? d).join(", ")
      : "default only";
    rows.push(`| \`${s.id}\` | ${s.n} | ${s.p} | ${declared.join(", ") || "—"} | ${statusOf(s)} | default, ${required} |`);
  }
}

const implemented = data.screens.map((c) => {
  const shots = shotsFor(c.id);
  const exits = c.exits.map((e) => `${e.to}${e.built ? "" : " (BLOCKED)"}`).join(", ");
  return [
    `\n### \`${c.id}\` — ${c.title}`,
    "",
    `**Purpose.** ${c.purpose}`,
    "",
    `| Property | Value |`,
    `| --- | --- |`,
    `| Destination | ${c.destination} |`,
    `| Back behaviour | \`${c.back.kind}\`${c.back.kind === "replace" ? ` → ${c.back.with}` : c.back.kind === "dismiss" ? ` → ${c.back.returnsTo}` : ""} |`,
    `| Primary action | ${c.primary ? `**${c.primary.label}** → ${c.primary.leadsTo}` : `none — ${c.noPrimaryBecause ?? "unstated"}` } |`,
    `| Secondary actions | ${c.secondary.length ? c.secondary.map((x) => `${x.label} → ${x.leadsTo}`).join("; ") : "none"} |`,
    `| Exits | ${exits || "none"} |`,
    `| Route guards | ${c.guards.length ? c.guards.map((g) => g.name).join(", ") : "none"} |`,
    `| Analytics emitted | ${c.telemetry.length ? c.telemetry.map((t) => `\`${t}\``).join(", ") : "none"} |`,
    `| Blueprint states | ${c.blueprintStates} |`,
    "",
    `**States that must be designed (${shots.length} currently rendered):**`,
    "",
    ...(shots.length
      ? shots.map((s) => `- \`${s.id}\` — **${s.state}**. ${s.note}`)
      : ["- _No state has been rendered yet. Every state below is a design gap._"]),
    "",
    ...(c.states.length
      ? [`**Declared treatments:** ${c.states.map((s) => `\`${s.kind}\``).join(", ")}`, ""]
      : ["**Declared treatments:** none — this screen has a single default state.", ""]),
  ].join("\n");
});

const md = `# Screen Inventory

> **Generated file — do not edit.** Produced by \`npm run design:inventory\` from
> \`docs/product/v3/phase0.js\` (the frozen Blueprint), the screen contracts in
> \`apps/patient/src/screens/core-loop.contract.ts\`, the shared screen registry
> in \`apps/patient/src/screens/gallery.tsx\`, and the navigation graph derived
> from those contracts. Regenerate it rather than editing it; a hand-maintained
> inventory disagrees with the build within one slice.

## Summary

| | Count |
| --- | --- |
| Blueprint v3 Phase 0 screens | ${PHASE0.length} |
| Screens with an engineering contract | ${data.screens.length} |
| Screens rendered and photographed | ${data.progress.rendered} |
| Distinct screen **states** rendered | ${data.shots.length} |
| Screens NOT IMPLEMENTED | ${data.gaps.length} |
| Exits declared but BLOCKED (target not built) | ${data.graph.dangling.length} |

**What "status" means**

- **IMPLEMENTED + RENDERED** — a contract exists, the screen is built, and at
  least one state is photographed in the review dashboard. The designer is
  redesigning something real and can compare against a screenshot.
- **CONTRACTED, NOT RENDERED** — the contract fixes the purpose, the actions,
  the back behaviour and the states, but no pixels exist. The designer is
  designing from the contract.
- **NOT IMPLEMENTED** — nothing exists but the Blueprint row. Design is needed
  before engineering can even write a contract.

---

## Part 1 — Every Blueprint screen
${rows.join("\n")}

---

## Part 2 — Screens with an engineering contract

Each of these has a **binding contract**. The designer may change how any of it
looks. The designer may **not** silently change the primary action, the back
behaviour, the set of states, or the exits — those are product decisions frozen
in Blueprint v3, and a design that contradicts one is a Blueprint amendment
that has to be raised, not absorbed.
${implemented.join("\n")}
`;

mkdirSync(join(REPO, "docs/design"), { recursive: true });
writeFileSync(join(REPO, "docs/design/SCREEN_INVENTORY.md"), md, "utf8");
console.log(`SCREEN_INVENTORY.md — ${PHASE0.length} Blueprint screens, ${data.screens.length} contracted, ${data.shots.length} states rendered`);
