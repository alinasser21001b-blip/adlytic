#!/usr/bin/env node
/**
 * Generate docs/design/DESIGN_FIDELITY_REPORT.md.
 *
 * Colour and typography fidelity are COMPUTED — the installed tokens are
 * diffed against the delivered specification, so a palette that drifts is
 * caught by the same run that reports it. The remaining categories are
 * recorded judgement from fidelity.mjs.
 *
 * A fidelity report written by hand is a self-assessment. This is a comparison.
 *
 * Run: npm run design
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DELIVERED, TURN4, CATEGORIES, SCREENS, DEVIATIONS, CLARIFICATIONS } from "./fidelity.mjs";

/** Measured responsive evidence, produced by tools/review/responsive.mjs. */
const RESPONSIVE_DATA = resolve(dirname(fileURLToPath(import.meta.url)), "../../../review/responsive.json");

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const OUT = join(REPO, "docs/design");
const data = JSON.parse(readFileSync(join(REPO, "review/data.json"), "utf8"));

/* ── Computed: colour ───────────────────────────────────────────────────── */

const installed = data.design.palette.dark;
const colourRows = Object.entries(DELIVERED.palette).map(([role, want]) => {
  const got = String(installed[role] ?? "");
  return { role, want, got, match: got.toUpperCase() === want.toUpperCase() };
});
const colourExact = colourRows.filter((r) => r.match).length;

/* ── Computed: typography ───────────────────────────────────────────────── */

const sizes = Object.values(data.design.type).map((t) => t.size);
const weights = [...new Set(Object.values(data.design.type).map((t) => t.weight))].sort((a, b) => a - b);
const wantedMax = Math.max(...Object.values(DELIVERED.type).flat());
const haveMax = Math.max(...sizes);

/* ── Scoring ────────────────────────────────────────────────────────────── */

const LABEL = {
  exact: "Exact Match", minor: "Minor Deviation", intended: "Intentional Deviation",
  missing: "Missing", blocked: "Blocked",
};
/** Exact and Intentional both count 1.0: an approved, recorded deviation is
 *  faithful — it is a decision, not a defect. */
const WEIGHT = { exact: 1, minor: 0.75, intended: 1, missing: 0, blocked: 0 };

/**
 * Responsive fidelity is MEASURED, not asserted.
 *
 * Every other category on this report is a judgement recorded against the
 * delivery. Responsive is the one the harness can answer on its own, so the
 * hand-written verdict is overwritten here from review/responsive.json — a
 * screen cannot claim a width it has not been photographed at, and cannot be
 * marked missing once it has passed at all four.
 */
const RESPONSIVE = existsSync(RESPONSIVE_DATA)
  ? JSON.parse(readFileSync(RESPONSIVE_DATA, "utf8"))
  : null;

/** Screen ids on this report are prefixes of the harness's state names —
 *  "R7-queued" covers R7-queued, "V2" covers V2-held / V2-cached / V2-last —
 *  unless the screen names its states explicitly, which is how a state whose
 *  gallery name differs from its delivery name stays measured. */
const responsiveVerdict = (id, declared) => {
  if (!RESPONSIVE) return null;
  const states = declared
    ? RESPONSIVE.screens.filter((x) => declared.includes(x.name))
    : RESPONSIVE.screens.filter((x) => x.name === id || x.name.startsWith(`${id}-`));
  if (!states.length) return null;
  const widths = RESPONSIVE.widths.join("/");
  const failing = states.filter((x) => x.verdict === "fail");
  const minor = states.filter((x) => x.verdict === "minor");
  const where = (xs) => xs.flatMap((x) => x.issues).map((i) => i.kind);
  if (failing.length)
    return ["missing", `Measured at ${widths}pt. ${failing.length} of ${states.length} state(s) FAIL: ${[...new Set(where(failing))].join(", ")}.`];
  if (minor.length)
    return ["minor", `Measured at ${widths}pt, no failures. ${minor.length} of ${states.length} state(s) carry a minor finding: ${[...new Set(where(minor))].join(", ")}.`];
  return ["exact", `Measured at ${widths}pt. All ${states.length} state(s) pass every detector: no overflow, no clipping, no cropped card, no target below the floor, no order change, no RTL regression.`];
};

const scored = Object.entries(SCREENS).map(([id, s]) => {
  const rv = responsiveVerdict(id, s.states);
  if (rv) s = { ...s, verdicts: { ...s.verdicts, Responsive: rv } };
  const vs = CATEGORIES.map((c) => s.verdicts[c]?.[0] ?? "missing");
  return { id, ...s, score: vs.reduce((n, v) => n + WEIGHT[v], 0) / vs.length };
});
const overall = scored.reduce((n, s) => n + s.score, 0) / scored.length;

const tally = {};
for (const s of scored) for (const c of CATEGORIES) {
  const v = s.verdicts[c]?.[0] ?? "missing";
  tally[v] = (tally[v] ?? 0) + 1;
}
const cells = scored.length * CATEGORIES.length;
const pct = (n) => `${Math.round(n * 100)}%`;
const nameOf = (id) => TURN4.find(([x]) => x === id)?.[1] ?? "";

/* ── Report ─────────────────────────────────────────────────────────────── */

const md = `# Design Fidelity Report

> **Generated — do not edit.** \`npm run design\` diffs the repository against
> the delivered specification transcribed in
> \`platform/tools/design/fidelity.mjs\`. **Colour and typography are computed**;
> the other eight categories are recorded judgement. A report written by hand is
> a self-assessment — this is a comparison.

**Delivery under assessment:** ${DELIVERED.name} · turn \`${DELIVERED.turn}\` · ${DELIVERED.frameWidth}pt · ${DELIVERED.scheme} · ${DELIVERED.numerals} numerals

---

## Overall fidelity

# ${pct(overall)}

${scored.length} screens × ${CATEGORIES.length} categories = ${cells} assessments.

| Verdict | Count | Share |
| --- | --- | --- |
${["exact", "minor", "intended", "missing", "blocked"].map((v) => `| ${LABEL[v]} | ${tally[v] ?? 0} | ${pct((tally[v] ?? 0) / cells)} |`).join("\n")}

Exact and Intentional both count 1.0 — an approved, recorded deviation is
faithful, because it is a decision rather than a defect. Minor counts 0.75.
Missing and Blocked count 0.

| Screen | | Fidelity |
| --- | --- | --- |
${scored.map((s) => `| \`${s.id}\` | ${nameOf(s.id)} | ${pct(s.score)} |`).join("\n")}

- **Completed:** ${scored.filter((s) => s.built).length} of ${scored.length} built
- **Not started:** ${scored.filter((s) => !s.built).map((s) => `\`${s.id}\``).join(", ") || "none"}
- **Blocked:** all ${scored.length} on Icon fidelity — no icon set exists, so that category cannot rise above Blocked on any screen

---

## Colour fidelity — computed

The installed dark palette, diffed role by role against the delivery.

| Role | Delivered | Installed | |
| --- | --- | --- | --- |
${colourRows.map((r) => `| \`${r.role}\` | \`${r.want}\` | \`${r.got}\` | ${r.match ? "Exact Match" : "**DRIFT**"} |`).join("\n")}

**${colourExact} of ${colourRows.length} roles match exactly.** One deliberate
departure from a delivered value — see DEV-1.

Values the delivery names that no semantic role covers — see CLR-5:

| Name | Value | Where |
| --- | --- | --- |
| info surface | \`${DELIVERED.extra.infoSurface}\` | E4 preserved-request banner |
| warning surface | \`${DELIVERED.extra.warningSurface}\` · text \`${DELIVERED.extra.warningText}\` | warning blocks |
| alert ground | \`${DELIVERED.extra.alertGround}\` | safety world |
| declined dot | \`${DELIVERED.extra.declinedDot}\` | R7 responder list |

---

## Typography fidelity — computed

| | Delivered | Installed |
| --- | --- | --- |
| Arabic family | ${DELIVERED.fonts.arabic.family}, weights ${DELIVERED.fonts.arabic.weights.join("/")} | named, **not bundled** |
| Mono family | ${DELIVERED.fonts.mono.family}, weights ${DELIVERED.fonts.mono.weights.join("/")} | named, **not bundled** |
| Largest size | ${wantedMax}px (the V2 code) | ${haveMax}px (\`display\`) |
| Weights | includes 800 for poster type | ${weights.join(", ")} |
| Letter-spacing | 0 | 0 — enforced every build |

The 76px code and the 800 weight have no token. See CLR-4.

---

## Fidelity by screen
${scored.map((s) => `
### \`${s.id}\` — ${nameOf(s.id)} · ${pct(s.score)}
${s.built ? "" : "\n**NOT BUILT.** A contract exists; no pixels do.\n"}
| Category | Verdict | Detail |
| --- | --- | --- |
${CATEGORIES.map((c) => {
  const [v, note] = s.verdicts[c] ?? ["missing", "Not assessed."];
  return `| ${c} | ${LABEL[v]} | ${note} |`;
}).join("\n")}
`).join("")}

---

## Intentional deviations
${DEVIATIONS.map((d) => `
### ${d.id} — ${d.what}

**Why.** ${d.why}

| | |
| --- | --- |
| Temporary | ${d.temporary ? "Yes — reverts when resolved" : "No — this is the rule now"} |
| Design approval required | ${d.designApproval ? "**Yes**" : "No"} |
| Product approval required | ${d.productApproval ? "**Yes**" : "No"} |
| Tracked as debt | ${d.debt ? `\`${d.debt}\`` : "Not debt — a resolved decision"} |
`).join("")}

---

## Design clarification requests

${CLARIFICATIONS.length} ambiguities, collected into one report rather than
asked one at a time. **Engineering has not guessed at any of them.**
${CLARIFICATIONS.map((c) => `
### ${c.id} — ${c.title}

**Context.** ${c.context}

**Screenshot.** \`${c.screenshot}\`

**Current implementation.** ${c.current}

**Design reference.** ${c.design}

**Why Engineering cannot decide.** ${c.why}

**Options.**
${c.options.map((o, i) => `${i + 1}. ${o}`).join("\n")}

**Engineering recommendation.** ${c.recommendation}
`).join("")}

---

## Remaining implementation work

In the delivery's own priority order.

| # | Work | Blocked by |
| --- | --- | --- |
| 1 | V2 layout — cached banner, light code panel, labelled facts card | CLR-1, CLR-2 |
| 2 | R7 sent — conic ring, responder rows, \`dwTick\` | CLR-6 |
| 3 | R7 queued — outbox card, dashed explain card | — |
| 4 | R8 — chip component, price suffix scaling, row affordance | CLR-3 |
| 5 | R9 — drop the price breakdown, match delivered sizes | CLR-4 |
| 6 | E4 — build the screen and the \`TextField\` it needs | CLR-4 |
| 7 | Motion — ${Object.keys(DELIVERED.motion).length} specified, 0 implemented | — |
| 8 | Icons — 0 of the required set exist | Asset delivery |
| 9 | Responsive — 320 / 360 / 430pt; currently 390pt only | — |
| 10 | Turn-3 screens | DEV-5, Product confirmation |

**Today's fidelity ceiling is ${pct((CATEGORIES.length - 1) / CATEGORIES.length)}.** Icon fidelity is Blocked on
every screen until an icon set exists, so one category in ten is pinned at zero
no matter how faithfully everything else is built.
`;

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "DESIGN_FIDELITY_REPORT.md"), md, "utf8");

console.log(`\nDesign fidelity\n`);
console.log(`  overall            ${pct(overall)}`);
console.log(`  colour roles       ${colourExact}/${colourRows.length} exact`);
console.log(`  screens built      ${scored.filter((s) => s.built).length}/${scored.length}`);
console.log(`  clarifications     ${CLARIFICATIONS.length} open`);
console.log(`  deviations         ${DEVIATIONS.length} (${DEVIATIONS.filter((d) => d.temporary).length} temporary)\n`);

const drift = colourRows.filter((r) => !r.match);
if (drift.length) {
  for (const d of drift) console.log(`  DRIFT  ${d.role}: delivered ${d.want}, installed ${d.got}`);
  console.log(`\n  ${drift.length} colour role(s) drifted from the delivery without a recorded deviation.\n`);
  process.exit(1);
}
console.log(`  PASS  no undocumented drift from the delivered palette\n`);
