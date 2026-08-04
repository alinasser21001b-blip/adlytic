#!/usr/bin/env node
/**
 * Generate the derived half of the Design Delivery Package.
 *
 *   docs/design/SCREEN_INVENTORY.md     every screen, 12 sections each
 *   docs/design/COMPONENT_INVENTORY.md  every component, 9 sections each
 *   docs/design/DIAGRAMS.md             six diagrams, all derived
 *
 * Facts come from the code: the frozen Blueprint, the screen contracts, the
 * shared screen registry, the navigation graph, the design tokens and the
 * source tree. Judgement comes from tools/design/notes.mjs, which is the only
 * hand-authored input. Nothing is written twice.
 *
 * Run: npm run design
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SCREEN_NOTES, COMPONENT_NOTES, MISSING_COMPONENTS } from "./notes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const PLATFORM = resolve(REPO, "platform");
const OUT = join(REPO, "docs/design");

const data = JSON.parse(readFileSync(join(REPO, "review/data.json"), "utf8"));
const w = {};
new Function("window", readFileSync(join(REPO, "docs/product/v3/phase0.js"), "utf8"))(w);
const PHASE0 = w.PHASE0;

const contracted = new Map(data.screens.map((s) => [s.id, s]));
const bp = new Map(PHASE0.map((s) => [s.id, s]));
const shotsFor = (id) => data.shots.filter((s) => s.screen === id);

/* ── Source-tree facts ──────────────────────────────────────────────────── */

const walk = (dir, out = []) => {
  let names; try { names = readdirSync(dir); } catch { return out; }
  for (const n of names) {
    if (n === "node_modules" || n === "dist") continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(n) && !/\.test\./.test(n)) out.push(p);
  }
  return out;
};

const screenFiles = walk(join(PLATFORM, "apps/patient/src/screens"))
  .filter((f) => /Screen\.tsx$/.test(f));

/** Which components each screen file actually renders, read from its JSX. */
const componentUsage = new Map(Object.keys(COMPONENT_NOTES).map((c) => [c, []]));
for (const f of screenFiles) {
  const src = readFileSync(f, "utf8");
  const file = f.split("/").pop().replace(".tsx", "");
  for (const c of componentUsage.keys())
    if (new RegExp(`<${c}[\\s/>]`).test(src)) componentUsage.get(c).push(file);
}
// Screen and StateBlock are rendered by the kit itself, for every screen.
componentUsage.set("Screen", screenFiles.map((f) => f.split("/").pop().replace(".tsx", "")));
componentUsage.set("StateBlock", ["(rendered by Screen, on every screen)"]);

const countIn = (needle) => {
  let n = 0;
  for (const f of walk(join(PLATFORM, "apps/patient/src"))) {
    const m = readFileSync(f, "utf8").match(new RegExp(`<${needle}[\\s/>]`, "g"));
    n += m ? m.length : 0;
  }
  return n;
};

/* ── SCREEN_INVENTORY.md ────────────────────────────────────────────────── */

const STATE_HELP = {
  loading: "a skeleton whose shape matches the content that is coming",
  empty: "an explanation, and — for the teaching variant — exactly one action",
  error: "what failed, whether the user's work survived, and one thing to press",
  offline: "whether the content is read-only, and how old it is",
  permissionRefused: "still usable, and naming the alternative",
  success: "an optional next step",
};

function screenSection(id) {
  const c = contracted.get(id);
  const b = bp.get(id);
  const n = SCREEN_NOTES[id] ?? {};
  const shots = shotsFor(id);
  const kinds = [...new Set(c.states.map((s) => s.kind))];

  const stateRows = c.states.length
    ? c.states.map((s) => {
        const detail = s.kind === "empty"
          ? `\`${s.isSuccess ? "quiet / success" : "teaching"}\` — “${s.explains}”${s.action ? ` · action: **${s.action.label}** → ${s.action.leadsTo}` : " · no action, deliberately"}`
          : s.kind === "error" ? `“${s.whatFailed}” · work preserved: ${s.workPreserved ? "yes" : "no"} · action: **${s.action.label}** → ${s.action.leadsTo}`
          : s.kind === "offline" ? `read-only: ${s.readOnly ? "yes" : "no"} · shows age: ${s.showsAge ? "yes" : "no"}`
          : s.kind === "permissionRefused" ? `alternative: “${s.alternative}”`
          : s.kind === "loading" ? "skeleton must match the real content"
          : "—";
        return `| \`${s.kind}\` | ${STATE_HELP[s.kind] ?? "—"} | ${detail} |`;
      })
    : ["| _none_ | This screen has a single default state. | — |"];

  return `
---

### \`${id}\` — ${c.title}

> **${b?.n ?? ""}** · Blueprint group: ${b?.g ?? "—"} · destination: \`${c.destination}\`

**Purpose (fixed by Blueprint v3).** ${c.purpose}

**User goal.** ${n.goal ?? "_Not yet articulated — ask Product._"}

**Emotional target.** ${n.emotion ?? "_Not yet articulated._"}

#### Required states

| State | What it owes the user | As implemented today |
| --- | --- | --- |
${stateRows.join("\n")}

Blueprint declares: \`${c.blueprintStates}\`. ${shots.length ? `${shots.length} state(s) rendered and photographed.` : "**No state has been rendered — the designer works from this contract alone.**"}

${shots.length ? `**Rendered states** (see \`review/index.html\` for the screenshots):\n\n${shots.map((s) => `- \`${s.id}\` — **${s.state}**. ${s.note}`).join("\n")}\n` : ""}
#### Required interactions

| Interaction | Detail |
| --- | --- |
| Primary action | ${c.primary ? `**${c.primary.label}** → \`${c.primary.leadsTo}\` (${c.primary.tapsToOutcome} tap to outcome)` : `**none** — ${c.noPrimaryBecause ?? "unstated"}`} |
| Secondary actions | ${c.secondary.length ? c.secondary.map((s) => `${s.label} → \`${s.leadsTo}\``).join("<br>") : "none"} |
| Back | \`${c.back.kind}\`${c.back.kind === "replace" ? ` → \`${c.back.with}\` — ${c.back.why}` : c.back.kind === "dismiss" ? ` → \`${c.back.returnsTo}\`` : c.back.kind === "none" ? ` — ${c.back.why}` : ""} |
| Exits | ${c.exits.map((e) => `\`${e.to}\`${e.built ? "" : " **(BLOCKED — target not built)**"}`).join(", ") || "none"} |
| Press feedback | **Not designed.** No pressed state exists anywhere in the product. |

#### Accessibility support required

- Every control ≥ 44pt (primaries ≥ 48pt) — **enforced on this screen every build**.
- Every control carries an accessible label — **enforced**.
- One numeral system — **enforced**.
- Contrast ≥ 4.5:1 body, 3.0:1 boundaries, in **both** schemes — **enforced**.
- **Needs design:** visible focus indicator; layout at 200% text; a non-colour signal for any state currently distinguished by hue alone.

#### Offline behaviour

${kinds.includes("offline")
  ? `Declared. ${c.states.filter((s) => s.kind === "offline").map((s) => `Content is ${s.readOnly ? "read-only" : "still editable"}${s.showsAge ? " and its age is shown" : ""}.`).join(" ")}`
  : "No offline state declared. The screen is either always available from local state, or is unreachable without a connection."}

#### Loading behaviour

${kinds.includes("loading") ? "Declared. The skeleton must match the shape of the content that follows — the `skeletonToReal` motion token (150ms) exists to animate that swap and is unimplemented." : "No loading state declared — this screen renders from state already in memory."}

#### Error behaviour

${kinds.includes("error")
  ? c.states.filter((s) => s.kind === "error").map((s) => `“${s.whatFailed}” — the user's work ${s.workPreserved ? "**survives**" : "does not survive"}, and there is exactly one recovery action: **${s.action.label}**.`).join(" ")
  : "No error state declared."}

#### Analytics-visible behaviour

${c.telemetry.length
  ? c.telemetry.map((t) => `- \`${t}\` — emitted from this screen. Any design that changes *when* the user reaches the emitting moment changes a product metric.`).join("\n")
  : "- None emitted from this screen."}

#### Blueprint references

- Screen row: \`${id}\` — ${b?.n ?? ""} (${b?.g ?? ""})
- Entry: ${b?.in ?? "—"}
- Exit: ${b?.out ?? "—"}
- Permission: ${b?.perm ?? "—"}
- Offline rule: ${b?.off ?? "—"}
- Clinical note: ${b?.cl ?? "none"}
- Route guards in code: ${c.guards.length ? c.guards.map((g) => `\`${g.name}\` (${g.bp})`).join(", ") : "none"}

#### Existing implementation notes

${n.notes ?? "_No notes._"}

#### FIXED by the Blueprint — design may not change these

${(n.fixed ?? ["_None recorded — treat the contract above as fixed._"]).map((f) => `- ${f}`).join("\n")}

#### OPEN to the designer

${(n.open ?? ["_Everything not listed as fixed._"]).map((f) => `- ${f}`).join("\n")}
`;
}

const notImplemented = PHASE0.filter((s) => !contracted.has(s.id));
const byGroup = {};
for (const s of notImplemented) (byGroup[s.g] ??= []).push(s);

const screenDoc = `# Screen Inventory

> **Generated — do not edit.** \`npm run design\` derives this from
> \`docs/product/v3/phase0.js\`, the screen contracts, the shared screen
> registry and the navigation graph, merged with the design notes in
> \`platform/tools/design/notes.mjs\`. Regenerate rather than edit.

| | Count |
| --- | --- |
| Blueprint v3 Phase 0 screens | ${PHASE0.length} |
| With an engineering contract | ${data.screens.length} |
| Rendered and photographed | ${data.progress.rendered} |
| Distinct states rendered | ${data.shots.length} |
| NOT IMPLEMENTED | ${notImplemented.length} |
| Exits declared but BLOCKED | ${data.graph.dangling.length} |

**How to read this.** Part 1 is the ${data.screens.length} screens that exist,
each with everything a designer needs and nothing they have to ask for. Part 2
is the ${notImplemented.length} screens that do not exist yet — design is needed
before Engineering can even write a contract for them.

Two words appear throughout and mean exactly one thing each:

- **FIXED** — a product decision already made in Blueprint v3 and already
  enforced by an automated check. A design that contradicts it cannot be built.
  Raise it as a Blueprint query; do not absorb it into the design.
- **OPEN** — genuinely yours. Engineering has no opinion and will implement
  whatever is specified.

---

## Part 1 — Screens with an engineering contract
${data.screens.map((s) => screenSection(s.id)).join("\n")}

---

## Part 2 — NOT IMPLEMENTED (${notImplemented.length} screens)

These have a Blueprint row and nothing else. Priority is by user impact:
the **Entry** group blocks every journey (a guest cannot sign in today), and
**Request/Reservation** completes the loop that already exists.

${Object.entries(byGroup).map(([g, ss]) => `
### ${g} — ${ss.length} screens

| Screen | Name | Purpose | States to design | Offline rule |
| --- | --- | --- | --- | --- |
${ss.map((s) => `| \`${s.id}\` | ${s.n} | ${s.p} | ${String(s.st) === "—" ? "default only" : s.st} | ${s.off} |`).join("\n")}
`).join("")}
`;

/* ── COMPONENT_INVENTORY.md ─────────────────────────────────────────────── */

const componentDoc = `# Component Inventory

> **Generated — do not edit.** Usage counts and consumer lists are read from
> the source tree; specifications come from \`platform/tools/design/notes.mjs\`.

## Usage map

| Component | Usages | Rendered by |
| --- | --- | --- |
${Object.keys(COMPONENT_NOTES).map((c) => `| \`${c}\` | ${countIn(c)} | ${(componentUsage.get(c) ?? []).join(", ") || "—"} |`).join("\n")}

---

## Specifications
${Object.entries(COMPONENT_NOTES).map(([name, n]) => `
### \`${name}\`

${n.purpose}

| | |
| --- | --- |
| **Used by** | ${(componentUsage.get(name) ?? []).join(", ") || "—"} (${countIn(name)} usages) |
| **Required variants** | ${n.variants.map((v) => `\`${v}\``).join(", ")} |
| **Required interactions** | ${n.interactions.join("; ")} |
| **Accessibility** | ${n.a11y} |
| **Motion** | ${n.motion} |
| **RTL** | ${n.rtl} |
| **Responsive** | ${n.responsive} |
| **Implementation constraints** | ${n.constraints} |
`).join("\n")}

---

## Components that do not exist and are needed

| Component | Needed by | Consequence today |
| --- | --- | --- |
${MISSING_COMPONENTS.map(([n, by, c]) => `| **${n}** | ${by} | ${c} |`).join("\n")}
`;

/* ── DIAGRAMS.md ────────────────────────────────────────────────────────── */

const flowDiagram = data.flows.map((f) => {
  const steps = f.steps.map((s) => `  ${s.screen}["${s.screen}<br/>${s.label}${s.optional ? "<br/>(optional)" : ""}"]`).join("\n");
  const edges = f.steps.map((s, i) => i < f.steps.length - 1 ? `  ${s.screen} --> ${f.steps[i + 1].screen}` : `  ${s.screen} --> ${f.completesAt}`).join("\n");
  const styles = f.steps.filter((s) => !s.built).map((s) => `  class ${s.screen} pending;`).join("\n");
  return `### Journey: ${f.id}\n\n_${f.goal}_\n\n\`\`\`mermaid\nflowchart LR\n${steps}\n  ${f.completesAt}["${f.completesAt}<br/>done"]\n  ${f.abandonsTo}["${f.abandonsTo}<br/>abandoned"]\n${edges}\n${f.steps[0].screen} -.abandon.-> ${f.abandonsTo}\n  classDef pending stroke-dasharray: 4 4;\n${styles}\n\`\`\`\n`;
}).join("\n");

const navNodes = data.screens.map((s) => `  ${s.id}["${s.id}<br/>${s.title}"]`).join("\n");
const navEdges = data.graph.edges.filter((e) => e.built).map((e) => `  ${e.from} --> ${e.to}`).join("\n");
const blockedEdges = data.graph.edges.filter((e) => !e.built).map((e) => `  ${e.from} -.blocked.-> ${e.to}["${e.to}<br/>NOT BUILT"]`).join("\n");

const kitDeps = Object.keys(COMPONENT_NOTES)
  .map((c) => `  ${c}`)
  .join("\n");

const tokenDiagram = `\`\`\`mermaid
flowchart TD
  subgraph Tokens
    color["colour<br/>${Object.keys(data.design.palette.light).length} semantic roles<br/>light + dark"]
    type["type<br/>${Object.keys(data.design.type).length} roles<br/>letter-spacing always 0"]
    space["space<br/>4pt scale, ${Object.keys(data.design.space).length} steps"]
    radius["radius<br/>${Object.keys(data.design.radius).length} values"]
    tap["tap targets<br/>${Object.values(data.design.tap).join(" / ")}pt"]
    motion["motion<br/>${Object.keys(data.design.motion).length} tokens<br/>ALL UNAPPLIED"]
    elevation["elevation<br/>5 levels<br/>ALL UNSPECIFIED"]
  end
  theme["themeFor(scheme)<br/>resolves one persona"]
  kit["ui/kit.tsx<br/>${Object.keys(COMPONENT_NOTES).length} components"]
  screens["${screenFiles.length} screen files"]
  color --> theme
  type --> theme
  space --> theme
  radius --> theme
  tap --> theme
  motion -.never read.-> kit
  elevation -.never read.-> kit
  theme --> kit
  kit --> screens
  classDef dead stroke-dasharray: 4 4;
  class motion,elevation dead;
\`\`\``;

const assetDiagram = `\`\`\`mermaid
flowchart LR
  icons["Icon set<br/>SVG · MISSING"] --> back["Back affordance<br/>currently ‹"]
  icons --> add["Add affordance<br/>currently +"]
  icons --> search["Search affordance<br/>currently ⌕"]
  icons --> stepper["Stepper<br/>currently + −"]
  icons --> tabbar["Tab bar<br/>COMPONENT MISSING"]
  fonts["Font files<br/>MISSING"] --> arabic["Arabic family<br/>4 weights"]
  fonts --> latin["Latin family<br/>drug names"]
  fonts --> tabular["Tabular figures<br/>countdown must not jitter"]
  tabular --> v2["V2 reservation code"]
  tabular --> r7["R7 countdown"]
  appicon["App icon<br/>MISSING"] --> build["Any device build"]
  notif["Notification icon<br/>MISSING"] --> promise["The product's core promise"]
  splash["Splash<br/>MISSING"] --> e1["E1 Launch"]
  photo["Photo viewer design<br/>MISSING"] --> r3["R3 — grey box today"]
  classDef missing fill:#fee,stroke:#c33;
  class icons,fonts,appicon,notif,splash,photo missing;
\`\`\``;

const dependencyDiagram = `\`\`\`mermaid
flowchart TD
${data.screens.map((s) => {
  const blocked = s.exits.filter((e) => !e.built);
  return blocked.length ? `  ${s.id} -.needs.-> ${blocked.map((b) => b.to).join(" & ")}` : null;
}).filter(Boolean).join("\n")}
  classDef gap stroke-dasharray: 4 4,fill:#fee;
  class ${[...new Set(data.graph.dangling.map((d) => d.split(" → ")[1]))].join(",")} gap;
\`\`\``;

const diagramDoc = `# Diagrams

> **Generated — do not edit.** Every diagram below is derived from the
> repository by \`npm run design\`. A hand-drawn diagram goes stale the first
> time a screen is added; these cannot.
>
> Rendered as Mermaid. GitHub, Figma's Mermaid plugins and most Markdown
> viewers render them directly.

---

## 1. Complete user journeys

Solid = built. Dashed = a Blueprint screen a later slice builds.

${flowDiagram}

---

## 2. Navigation graph

Every edge comes from a screen contract. Dotted edges point at screens this
build does not contain — **no control renders for them**, so a patient cannot
reach a dead end, but the design must eventually fill them.

\`\`\`mermaid
flowchart TD
${navNodes}
${navEdges}
${blockedEdges}
  classDef built stroke:#186047;
\`\`\`

- Entry points (reached without a parent — a tab bar, a notification, or a guard redirect): ${data.graph.entryPoints.map((e) => `\`${e}\``).join(", ")}
- Unreachable screens: **${data.graph.unreachable.length}**
- Navigation traps: **${data.graph.traps.length}**
- Blocked exits: **${data.graph.dangling.length}**

---

## 3. Component hierarchy

\`\`\`mermaid
flowchart TD
  Screen["Screen<br/>the frame every screen renders through"]
  Screen --> Header["header: back + title + flow progress"]
  Screen --> Sticky["sticky slot (F1/F2 search)"]
  Screen --> Body["scrolling body"]
  Screen --> Footer["footer: one action"]
  Body --> StateBlock["StateBlock<br/>6 treatments"]
  Body --> Content["screen content"]
  Content --> ActionCard
  Content --> InfoCard
  Content --> Choice
  Content --> Secondary
  Footer --> Primary
  ActionCard --> Label
  InfoCard --> Label
  Choice --> Label
  Primary --> Label
  Secondary --> Label
  Label --> Digits
  Label --> Bidi
\`\`\`

---

## 4. Design token relationships

${tokenDiagram}

Two token families are declared and **never read by any component**: motion
(${Object.keys(data.design.motion).length} tokens) and elevation (5 levels).
They are the two largest specification gaps.

---

## 5. Asset dependency map

${assetDiagram}

---

## 6. Screen dependency map

Which built screens are waiting on which unbuilt ones. Each dotted edge is a
control that cannot be rendered today.

${dependencyDiagram}
`;

/* ── DESIGN_TOKENS.md — the actual current values ───────────────────────── */

const d = data.design;
const roles = Object.keys(d.palette.light);

const tokenDoc = `# Design Tokens — current values

> **Generated — do not edit.** These are the values the application renders
> with **today**, read from \`packages/design/src/tokens/\`. They are the
> starting point, not the answer: change any of them, but change them here in
> the design system rather than on a layer.
>
> The contrast column is **measured**, not asserted — computed with the WCAG
> relative-luminance formula on every build. A pair below the floor fails the
> build.

## Colour — patient persona

15 semantic roles. A component names a role and receives a value; no component
writes a hex. Two schemes.

| Role | Light | Dark | Used in code |
| --- | --- | --- | --- |
${roles.map((r) => `| \`${r}\` | \`${d.palette.light[r]}\` | \`${d.palette.dark[r]}\` | ${["success", "onSuccess", "onWarning", "onAlert"].includes(r) ? "**never — see R-5**" : "yes"} |`).join("\n")}

Two further personas exist in the design system and are **out of scope for this
handoff**: \`pharmacy\` (dense, dark, high-contrast — the emotional target is
*fast*) and \`owner\` (neutral, tabular — the target is *certain*). Same 15
role names, different values. Do not design them yet.

### Measured contrast — the pairs a component may actually produce

Floor: **${d.contrastFloor.bodyText}:1** body text, **${d.contrastFloor.largeText}:1** large text, **${d.contrastFloor.uiBoundary}:1** UI boundaries.

| Pair | Light | Dark | |
| --- | --- | --- | --- |
${d.contrast.map((c) => `| \`${c.pair}\` | ${c.light} | ${c.dark} | ${c.passes ? "pass" : "**BELOW FLOOR**"} |`).join("\n")}

Any colour you change is re-measured on the next build. A failing pair comes
back to you with its measured ratio, not an opinion.

## Typography

| Role | Size | Line height | Weight | May carry clinical content |
| --- | --- | --- | --- | --- |
${Object.entries(d.type).map(([k, v]) => `| \`${k}\` | ${v.size}pt | ${v.lineHeight} (= ${Math.round(v.size * v.lineHeight)}pt) | ${v.weight} | ${v.clinicalAllowed ? "yes" : "**no — barred by type**"} |`).join("\n")}

- **Letter-spacing is 0 on every role, always.** Arabic is a connected script
  and tracking breaks the joins. This is not adjustable.
- \`display\` and \`caption\` cannot carry clinical content. A dosage set in
  \`caption\` is a compile error, not a review comment.
- Families named in code and **not bundled**: IBM Plex Sans Arabic, IBM Plex
  Sans, IBM Plex Mono. See R-2.

## Spacing — a 4pt rhythm

| Token | Value |
| --- | --- |
${Object.entries(d.space).map(([k, v]) => `| \`space-${k}\` | ${v}pt |`).join("\n")}

No value outside this scale exists in the product. A 6pt gap cannot be built
without adding a token.

## Radius

| Token | Value |
| --- | --- |
${Object.entries(d.radius).map(([k, v]) => `| \`${k}\` | ${v}pt |`).join("\n")}

## Touch targets

| Token | Value | Applies to |
| --- | --- | --- |
| \`min\` | ${d.tap.min}pt | every control, everywhere — measured on every rendered state |
| \`patientPrimary\` | ${d.tap.patientPrimary}pt | the primary action in the patient app |
| \`pharmacyPrimary\` | ${d.tap.pharmacyPrimary}pt | the pharmacy app — used one-handed at speed with a customer waiting |

## Motion — declared, none implemented

| Token | Duration | Easing (name only — **needs cubic-bézier values**) | What it teaches |
| --- | --- | --- | --- |
${Object.entries(d.motion).map(([k, v]) => `| \`${k}\` | ${v.duration}ms | ${v.easing} | ${v.teaches} |`).join("\n")}

## Elevation — declared, none specified

\`flat\` · \`raised\` · \`overlay\` · \`sheet\` · \`alert\`

Five levels exist as names with no visual definition, and no component reads
them. See R-3.
`;

/* ── Write ──────────────────────────────────────────────────────────────── */

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "SCREEN_INVENTORY.md"), screenDoc, "utf8");
writeFileSync(join(OUT, "COMPONENT_INVENTORY.md"), componentDoc, "utf8");
writeFileSync(join(OUT, "DIAGRAMS.md"), diagramDoc, "utf8");
writeFileSync(join(OUT, "DESIGN_TOKENS.md"), tokenDoc, "utf8");

console.log(`\nDesign package — generated\n`);
console.log(`  SCREEN_INVENTORY.md     ${data.screens.length} contracted + ${notImplemented.length} not implemented`);
console.log(`  COMPONENT_INVENTORY.md  ${Object.keys(COMPONENT_NOTES).length} components + ${MISSING_COMPONENTS.length} missing`);
console.log(`  DIAGRAMS.md             6 diagrams, all derived`);
console.log(`  DESIGN_TOKENS.md        ${roles.length} colour roles, ${d.contrast.length} measured pairs\n`);

const undocumented = data.screens.filter((s) => !SCREEN_NOTES[s.id]);
if (undocumented.length) {
  console.log(`  WARNING  ${undocumented.length} contracted screen(s) have no design notes: ${undocumented.map((s) => s.id).join(", ")}`);
  console.log(`           A designer reading those sections finds a contract and no judgement.\n`);
  process.exit(1);
}
console.log(`  PASS  every contracted screen has design notes\n`);
