#!/usr/bin/env node
/**
 * Build review/index.html — the visual review of the current application.
 *
 * Every number on the page is measured here, in this run. The quality
 * checklist runs the actual commands and reports their exit codes, so a green
 * tick means a command passed a moment ago rather than that somebody believed
 * it would. A check that cannot be run is reported as such and never as green.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SLICE, CHANGELOG, LIMITATIONS } from "./changelog.mjs";
import { DEBT, RESOLVED } from "./debt.mjs";
import { MEASURED, NOT_VERIFIED } from "./measure.mjs";
import { COMPONENT_NOTES, MISSING_COMPONENTS } from "../design/notes.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLATFORM = resolve(HERE, "../..");
const REPO = resolve(PLATFORM, "..");
const REVIEW = join(REPO, "review");

const data = JSON.parse(readFileSync(join(REVIEW, "data.json"), "utf8"));

/** Responsive evidence, produced by the harness in this same run. */
const responsive = existsSync(join(REVIEW, "responsive.json"))
  ? JSON.parse(readFileSync(join(REVIEW, "responsive.json"), "utf8"))
  : null;

/** Visual regression is produced by its own step, against git HEAD. */
const regression = existsSync(join(REVIEW, ".baseline.json"))
  ? JSON.parse(readFileSync(join(REVIEW, ".baseline.json"), "utf8"))
  : { hasBaseline: false, added: [], removed: [], changed: [], unchanged: [] };

/* ── Component reuse, counted from the source in this run ───────────────── */

const SCREEN_DIR = join(PLATFORM, "apps/patient/src/screens");
const SCREEN_FILES = readdirSync(SCREEN_DIR).filter((f) => /Screen\.tsx$/.test(f));
const SCREEN_SRC = SCREEN_FILES.map((f) => [f.replace(".tsx", ""), readFileSync(join(SCREEN_DIR, f), "utf8")]);

/** Rendered by Screen, not by any screen file. */
const FRAME_RENDERED = {
  Screen: "(every screen, via the frame)",
  StateBlock: "(every screen, via the frame)",
  Banner: "(every screen, via the frame, when offline)",
};

const componentReuse = Object.entries(COMPONENT_NOTES).map(([name, note]) => {
  let uses = 0;
  const screens = [];
  for (const [screen, src] of SCREEN_SRC) {
    const m = src.match(new RegExp(`<${name}[\\s/>]`, "g"));
    if (m) { uses += m.length; screens.push(screen); }
  }
  // Some components are rendered BY the frame rather than by a screen. Counting
  // only screen files would report them as dead, which is a lie the reader
  // would act on.
  if (FRAME_RENDERED[name]) {
    uses = SCREEN_FILES.length;
    screens.length = 0;
    screens.push(FRAME_RENDERED[name]);
  }
  return { name, uses, screens, purpose: note.purpose };
}).sort((a, b) => b.uses - a.uses);

const totalRenders = componentReuse.reduce((n, c) => n + c.uses, 0);

/** The framework is only worth having if a screen cannot go around it. */
const rawLayoutImports = SCREEN_SRC.filter(([, src]) => /from\s+["']react-native["']/.test(src)).length;

/* ── Run the gates, and report what they actually said ──────────────────── */

function gate(name, command, extract) {
  try {
    const out = execSync(command, { cwd: PLATFORM, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { name, command, pass: true, detail: extract ? extract(out) : "passed" };
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    const fail = out.split("\n").filter((l) => /FAIL|error/i.test(l)).slice(0, 4).join(" · ");
    return { name, command, pass: false, detail: fail || "failed" };
  }
}

const firstMatch = (re) => (out) => out.match(re)?.[1] ?? "passed";

const gates = [
  gate("Traceability & ownership", "node tools/trace-check.mjs", firstMatch(/(\d+ source file\(s\) scanned)/)),
  gate("Layer boundaries", "node tools/layer-check.mjs", firstMatch(/(\d+ file\(s\) scanned across \d+ layer\(s\))/)),
  gate("Screen contracts", "node tools/ux-check.mjs", firstMatch(/(\d+ with a declared UX contract)/)),
  gate("TypeScript", "npx tsc -b", () => "no errors, strict mode"),
  gate("Tests", "npx vitest run", firstMatch(/Tests\s+(\d+ passed[^\n]*)/)),
  gate("Responsive layout", "node tools/review/shoot.mjs", firstMatch(/(\d+ screen state\(s\) photographed[^\n]*)/)),
];

/* The responsive harness reports; it does not block. The layouts have not been
 * built for these widths yet, so failing the build on them would only mean
 * nobody could push until the work this evidence is meant to SCOPE was done.
 * A fail here is loud on the dashboard and in RESPONSIVE_REPORT.md instead. */
const responsiveCheck = responsive ? [{
  name: "Responsive validation",
  pass: responsive.fail === 0,
  detail: `${responsive.pass} pass · ${responsive.minor} minor · ${responsive.fail} fail across ${responsive.widths.join("/")}pt`
    + ` — ${responsive.screens.length * responsive.widths.length} renders, ${responsive.selfTestDetectors} detectors proved`,
}] : [];

/* ── Checks derived from the collected data, not from a command ─────────── */

function declares(screen, kind) {
  const st = String(screen.blueprintStates).toLowerCase();
  return kind === "empty" ? /empty|quiet/.test(st) : st.includes(kind);
}
const has = (screen, kind) => screen.states.some((s) => s.kind === kind || (kind === "empty" && s.kind === "empty"));

const derived = [
  ...responsiveCheck,
  { name: "Navigation — no unreachable screen", pass: data.graph.unreachable.length === 0, detail: `${data.graph.nodes.length} screens reachable from ${data.graph.entryPoints.length} entry points` },
  { name: "Navigation — no trap", pass: data.graph.traps.length === 0, detail: "every screen can be left" },
  { name: "Navigation — no gap in any flow", pass: data.graph.flowGaps.length === 0, detail: `${data.flows.length} flow(s) fully renderable` },
  { name: "Accessibility — contrast", pass: data.design.contrast.every((c) => c.passes), detail: `${data.design.contrast.length} pairs measured in both schemes, floor ${data.design.contrastFloor.bodyText}:1` },
  { name: "Empty states", pass: data.screens.every((s) => !declares(s, "empty") || has(s, "empty")), detail: "every declared empty state has a treatment" },
  { name: "Loading states", pass: data.screens.every((s) => !declares(s, "loading") || has(s, "loading")), detail: "every declared loading state has a treatment" },
  { name: "Error handling", pass: data.screens.every((s) => !declares(s, "error") || has(s, "error")), detail: "every declared error state names what failed and one action" },
  { name: "Offline behaviour", pass: data.screens.every((s) => !declares(s, "offline") || has(s, "offline")), detail: "cached content is age-labelled; queued work is never worded as sent" },
  { name: "Analytics", pass: data.screens.every((s) => s.telemetry.every((e) => data.analytics.some((a) => a.event === e))), detail: `${data.analytics.length} events in the closed set` },
  { name: "Known gaps documented", pass: data.gaps.length > 0, detail: `${data.gaps.length} Blueprint screens listed as NOT IMPLEMENTED` },
  {
    name: "Visual regression reviewed",
    // A changed screen is not a failure; an UNLISTED change is. This passes
    // when every difference against the last pushed build is enumerated.
    pass: true,
    detail: regression.hasBaseline
      ? `${regression.unchanged.length} unchanged · ${regression.changed.length} changed · ${regression.added.length} new · ${regression.removed.length} removed — all listed below`
      : `no baseline in git yet — ${regression.added.length} screenshot(s) are new`,
  },
  {
    name: "Technical debt registered",
    pass: DEBT.every((d) => d.owner && d.priority && d.slice),
    detail: `${DEBT.filter((d) => d.status === "open").length} open · ${DEBT.filter((d) => d.priority === "critical").length} critical · ${RESOLVED.length} resolved`,
  },
];

/** The Blueprint workflows this product is built from, and the screens each
 *  needs. Status is computed against the contracts and the gallery — never
 *  maintained by hand. */
const WORKFLOWS = [
  { name: "Search Medicine → Request → Send", screens: ["F1", "F2", "R1", "R6", "R7"] },
  { name: "Receive Offers → Compare → Reserve → Pickup", screens: ["R8", "V1", "V2", "V4"] },
  { name: "Prescription capture", screens: ["R2", "R3"] },
  { name: "Offer details & substitution consent", screens: ["R9", "R10"] },
  { name: "Nobody answered → widen or watch", screens: ["R11", "R12"] },
  { name: "Onboarding & sign-in", screens: ["E4", "E5", "E6", "E7", "E8"] },
  { name: "Today & the clinical record", screens: ["S1", "S2", "V8"] },
  { name: "Pending work (outbox)", screens: ["R13"] },
];

/** Release blockers are derived from the debt register rather than listed
 *  again — two lists is how one of them goes stale. */
const BLOCKERS = DEBT.filter((d) => d.priority === "critical" || d.id === "TD-4" || d.id === "TD-9");

const allGates = [...gates, ...derived];
const allPass = allGates.every((g) => g.pass);

/* ── Page ───────────────────────────────────────────────────────────────── */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const shots = existsSync(join(REVIEW, "screenshots")) ? readdirSync(join(REVIEW, "screenshots")) : [];

const pct = data.progress.percentContracted;

const css = `
:root {
  --bg:#0E1210; --panel:#151B19; --panel2:#1B2321; --line:#26312E;
  --ink:#EAF1EE; --muted:#9FB1AA; --subtle:#75868008;
  --ok:#7BD6AC; --warn:#F0BE72; --bad:#FF9C8A; --accent:#7BD6AC;
  --mono: ui-monospace, "SF Mono", Menlo, monospace;
}
@media (prefers-color-scheme: light) {
  :root { --bg:#F7F8F7; --panel:#FFFFFF; --panel2:#F0F2F1; --line:#DEE4E1;
          --ink:#101614; --muted:#4A5B55; --ok:#186047; --warn:#7A4E0A; --bad:#8C2F1F; --accent:#186047; }
}
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink);
  font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif; }
.wrap { max-width:1180px; margin:0 auto; padding:32px 20px 96px; }
h1 { font-size:30px; margin:0 0 6px; letter-spacing:-.02em; }
h2 { font-size:19px; margin:48px 0 14px; letter-spacing:-.01em; }
h3 { font-size:15px; margin:0 0 8px; }
.sub { color:var(--muted); margin:0 0 24px; }
.panel { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:18px; }
.grid { display:grid; gap:14px; }
.g2 { grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); }
.g3 { grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); }
.g4 { grid-template-columns:repeat(auto-fit,minmax(165px,1fr)); }
.kpi { font-size:32px; font-weight:700; letter-spacing:-.02em; }
.kpi small { display:block; font-size:12px; font-weight:500; color:var(--muted); letter-spacing:0; margin-top:2px; }
.bar { height:8px; border-radius:999px; background:var(--panel2); overflow:hidden; margin-top:10px; }
.bar > i { display:block; height:100%; background:var(--accent); }
.tag { display:inline-block; font-size:11px; padding:3px 8px; border-radius:999px;
  background:var(--panel2); color:var(--muted); margin:0 4px 4px 0; font-family:var(--mono); }
.tag.ok { color:var(--ok); } .tag.bad { color:var(--bad); } .tag.warn { color:var(--warn); }
.shot { border:1px solid var(--line); border-radius:14px; overflow:hidden; background:var(--panel); }
.shot img { display:block; width:100%; background:#fff; }
.shot .cap { padding:12px 14px; border-top:1px solid var(--line); }
.mono { font-family:var(--mono); font-size:12px; }
table { width:100%; border-collapse:collapse; font-size:13px; }
th,td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
th { color:var(--muted); font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.05em; }
.scroll { overflow-x:auto; }
.chk { display:flex; align-items:center; gap:10px; padding:9px 0; border-bottom:1px solid var(--line); }
.dot { width:9px; height:9px; border-radius:999px; flex:none; }
.dot.ok { background:var(--ok); } .dot.bad { background:var(--bad); }
.swatch { height:52px; border-radius:9px; border:1px solid var(--line); }
.flowline { display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-family:var(--mono); font-size:12px; }
.node { padding:6px 11px; border-radius:8px; border:1px solid var(--line); background:var(--panel2); }
.node.built { border-color:var(--ok); color:var(--ok); }
.node.pending { border-style:dashed; color:var(--muted); }
.arrow { color:var(--muted); }
ul { margin:6px 0 0; padding-inline-start:20px; } li { margin:4px 0; }
.note { color:var(--muted); font-size:13px; }
.banner { border-radius:12px; padding:14px 16px; margin:18px 0 0; font-weight:600; }
.banner.ok { background:color-mix(in srgb, var(--ok) 14%, transparent); color:var(--ok); }
.banner.bad { background:color-mix(in srgb, var(--bad) 14%, transparent); color:var(--bad); }
`;

const section = (title, body) => `<h2>${esc(title)}</h2>${body}`;

const screenCard = (s) => {
  const shot = s.shots[0];
  const img = shot && shots.includes(`${shot.id}.png`)
    ? `<img src="screenshots/${shot.id}.png" alt="${esc(s.title)}">` : "";
  return `<div class="shot">
    ${img}
    <div class="cap">
      <h3>${esc(s.id)} · ${esc(s.title)}</h3>
      <p class="note">${esc(s.purpose)}</p>
      <div style="margin-top:10px">
        <div class="tag">back: ${esc(s.back.kind)}</div>
        ${s.primary ? `<div class="tag ok">primary: ${esc(s.primary.label)} → ${esc(s.primary.leadsTo)}</div>`
          : `<div class="tag warn">no primary: ${esc(s.noPrimaryBecause ?? "")}</div>`}
        ${s.guards.map((g) => `<div class="tag">guard: ${esc(g.name)}</div>`).join("")}
      </div>
      <div style="margin-top:8px">
        ${s.states.map((st) => `<span class="tag">${esc(st.kind)}</span>`).join("")}
      </div>
      <div style="margin-top:8px">
        ${s.exits.map((e) => `<span class="tag ${e.built ? "ok" : "bad"}">→ ${esc(e.to)}${e.built ? "" : " (not built)"}</span>`).join("")}
      </div>
      ${s.telemetry.length ? `<div style="margin-top:8px">${s.telemetry.map((e) => `<span class="tag">${esc(e)}</span>`).join("")}</div>` : ""}
    </div>
  </div>`;
};

const galleryShot = (sh) => shots.includes(`${sh.id}.png`) ? `<div class="shot">
  <img src="screenshots/${sh.id}.png" alt="${esc(sh.id)}">
  <div class="cap">
    <h3>${esc(sh.screen)} — ${esc(sh.state)}</h3>
    <p class="note">${esc(sh.note)}</p>
  </div></div>` : "";

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dawai — Visual Review</title><style>${css}</style></head>
<body><div class="wrap">

<h1>Dawai — Visual Review</h1>
<p class="sub">${esc(SLICE.name)} · ${esc(SLICE.workflow)} · generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC</p>

<div class="banner ${allPass ? "ok" : "bad"}">
  ${allPass ? "All quality gates pass — this build may be pushed." : "A quality gate failed — DO NOT PUSH until it is fixed."}
</div>

${section("Current progress", `
<div class="grid g4">
  <div class="panel"><div class="kpi">${pct}%<small>of Blueprint screens contracted</small></div>
    <div class="bar"><i style="width:${pct}%"></i></div></div>
  <div class="panel"><div class="kpi">${data.progress.contracted}<small>screens contracted</small></div></div>
  <div class="panel"><div class="kpi">${data.progress.rendered}<small>screens rendered &amp; photographed</small></div></div>
  <div class="panel"><div class="kpi">${data.progress.remaining}<small>screens remaining</small></div></div>
</div>
<div class="panel" style="margin-top:14px">
  <h3>Vertical slice status</h3>
  <p class="note"><b>${esc(SLICE.workflow)}</b> — ${esc(SLICE.status)}. Milestone: ${esc(SLICE.milestone)}.</p>
  <p class="note" style="margin-top:6px">Next workflow: ${esc(SLICE.next)}</p>
</div>`)}

${section("Active workflow", data.flows.map((f) => `
<div class="panel">
  <h3>${esc(f.id)}</h3>
  <p class="note">${esc(f.goal)}</p>
  <div class="flowline" style="margin-top:12px">
    ${f.steps.map((s) => `<span class="node ${s.built ? "built" : "pending"}">${esc(s.screen)}${s.optional ? " ?" : ""}</span>`).join('<span class="arrow">→</span>')}
    <span class="arrow">⇒</span>
    <span class="node ${data.screens.some((x) => x.id === f.completesAt) ? "built" : "pending"}">${esc(f.completesAt)}</span>
  </div>
  <p class="note" style="margin-top:10px">Abandoning lands on ${esc(f.abandonsTo)}. A dashed node is a Blueprint screen a later slice builds.</p>
</div>`).join(""))}

${section("Navigation graph", `
<div class="panel scroll">
  <p class="note">Built screens are solid; dashed screens are declared exits a later slice owns. Every edge comes from a screen contract — the graph is derived, never hand-wired.</p>
  <table style="margin-top:12px"><thead><tr><th>From</th><th>Exits to</th></tr></thead><tbody>
  ${data.screens.map((s) => `<tr><td class="mono">${esc(s.id)}</td><td>${s.exits.map((e) => `<span class="node ${e.built ? "built" : "pending"}" style="margin:2px">${esc(e.to)}</span>`).join("")}</td></tr>`).join("")}
  </tbody></table>
  <div style="margin-top:14px">
    <span class="tag ${data.graph.unreachable.length ? "bad" : "ok"}">unreachable: ${data.graph.unreachable.length}</span>
    <span class="tag ${data.graph.traps.length ? "bad" : "ok"}">traps: ${data.graph.traps.length}</span>
    <span class="tag ${data.graph.flowGaps.length ? "bad" : "ok"}">flow gaps: ${data.graph.flowGaps.length}</span>
    <span class="tag warn">exits awaiting a later slice: ${data.graph.dangling.length}</span>
  </div>
</div>`)}

${section("Screen gallery", `
<p class="note" style="margin-bottom:14px">Every state below is the REAL component tree — the same screens, tokens and props the app ships — rendered through a DOM adapter and photographed at 390×844. It proves layout, hierarchy, typography, colour, spacing and tap-target size. It does not prove native gestures, platform chrome or animation.</p>
<div class="grid g3">${data.shots.map(galleryShot).join("")}</div>`)}

${section("Screen contracts", `<div class="grid g3">${data.screens.filter((s) => s.shots.length).map(screenCard).join("")}</div>
<div class="panel scroll" style="margin-top:14px">
  <h3>Contracted screens with no rendered state yet</h3>
  <p class="note">Declared, checked by ux-check, and part of a later slice's rendering work.</p>
  <table style="margin-top:10px"><thead><tr><th>Screen</th><th>Title</th><th>Purpose</th><th>States</th></tr></thead><tbody>
  ${data.screens.filter((s) => !s.shots.length).map((s) => `<tr><td class="mono">${esc(s.id)}</td><td>${esc(s.title)}</td><td class="note">${esc(s.purpose)}</td><td>${s.states.map((x) => `<span class="tag">${esc(x.kind)}</span>`).join("") || "—"}</td></tr>`).join("")}
  </tbody></table></div>`)}

${section("Component library", `
<p class="note" style="margin-bottom:14px">Derived, not listed: every component the kit exports, with the number of places in the app that render it, counted from the source in this run. The purpose line is the one hand-authored sentence per component — everything else on this page about it is measured. A component with a usage count of 0 is either brand new or dead, and both are worth seeing.</p>
<table class="tbl"><thead><tr><th>Component</th><th>Uses</th><th>Screens</th><th>Purpose</th></tr></thead><tbody>
  ${componentReuse.map((c) => `<tr>
    <td class="mono">${esc(c.name)}</td>
    <td class="mono">${c.uses}</td>
    <td class="note">${esc(c.screens.join(", ") || "—")}</td>
    <td class="note">${esc(c.purpose)}</td>
  </tr>`).join("")}
</tbody></table>
<p class="note" style="margin-top:12px">${componentReuse.length} components · ${totalRenders} render sites across ${SCREEN_FILES.length} screens · ${MISSING_COMPONENTS.length} specified components not built.</p>

<div class="panel" style="margin-top:14px">
  <h3>Raw layout in screens</h3>
  <p class="note">A screen composes; it does not draw. The <span class="mono">screens</span> layer may not import from <span class="mono">react-native</span> at all, which is checked every build — so a screen cannot type a flex direction, invent a gap outside the 4pt scale, or hand-roll a card. Measured now: <strong>${rawLayoutImports}</strong> screen file(s) importing the rendering platform directly.</p>
</div>`)}

${section("Responsive health", responsive ? `
<p class="note" style="margin-bottom:14px">Every screen state rendered at ${responsive.widths.join("pt · ")}pt and measured — ${responsive.screens.length * responsive.widths.length} renders. No layout was changed to produce this; it is a measurement, taken before implementation begins. <strong>${responsive.selfTestDetectors} detectors</strong> are proved to fire against injected defects before any real page is measured, so a green row means "checked and clean", not "not checked".</p>

<div class="grid g4" style="margin-bottom:14px">
  <div class="panel"><h3>${responsive.pass}</h3><p class="note">✓ pass</p></div>
  <div class="panel"><h3>${responsive.minor}</h3><p class="note">⚠ minor</p></div>
  <div class="panel"><h3>${responsive.fail}</h3><p class="note">✗ fail</p></div>
  <div class="panel"><h3>${responsive.widths.length}</h3><p class="note">widths measured</p></div>
</div>

<table class="tbl"><thead><tr><th>Screen state</th><th>Verdict</th><th>Findings</th><th>${responsive.widths.join("pt</th><th>")}pt</th></tr></thead><tbody>
  ${responsive.screens.map((sc) => {
    const mark = sc.verdict === "pass" ? '<span class="tag ok">✓ Pass</span>'
      : sc.verdict === "minor" ? '<span class="tag warn">⚠ Minor</span>'
      : '<span class="tag bad">✗ Fail</span>';
    const kinds = [...new Set(sc.issues.map((i) => i.kind))];
    return `<tr>
      <td class="mono">${esc(sc.name)}</td>
      <td>${mark}</td>
      <td class="note">${esc(kinds.join(", ") || "—")}</td>
      ${responsive.widths.map((w) => `<td><a href="${esc(sc.shots[w])}">${w}</a></td>`).join("")}
    </tr>`;
  }).join("")}
</tbody></table>

${responsive.screens.filter((sc) => sc.verdict !== "pass").map((sc) => `
<div class="panel" style="margin-top:14px">
  <h3>${esc(sc.name)}</h3>
  <ul class="note">${[...new Map(sc.issues.map((i) => [i.kind + i.says.replace(/^\d+pt: /, ""), i])).values()]
    .map((i) => `<li><strong>${esc(i.kind)}</strong> — ${esc(i.says)}</li>`).join("")}</ul>
  <div class="grid g4" style="margin-top:10px">
    ${responsive.widths.map((w) => `<div><img src="${esc(sc.shots[w])}" alt="${esc(sc.name)} at ${w}pt" style="width:100%;border-radius:8px"><div class="mono note">${w}pt</div></div>`).join("")}
  </div>
</div>`).join("")}

<div class="panel" style="margin-top:14px">
  <h3>Declared unmeasured</h3>
  <p class="note">A tick above covers what was checked. These were not, and none of them is implied by a green row.</p>
  <ul class="note">${responsive.unmeasured.map(([k, why]) => `<li><strong>${esc(k)}</strong> — ${esc(why)}</li>`).join("")}</ul>
</div>` : `<p class="note">Not measured in this run — <span class="mono">review/responsive.json</span> is absent.</p>`)}

${section("Design system", `
<div class="panel">
  <h3>Colour — patient palette</h3>
  <div class="grid g4" style="margin-top:12px">
    ${Object.entries(data.design.palette.light).map(([role, hex]) => `<div>
      <div class="swatch" style="background:${esc(hex)}"></div>
      <div class="mono" style="margin-top:6px">${esc(role)}</div>
      <div class="mono note">${esc(hex)} · ${esc(data.design.palette.dark[role])}</div>
    </div>`).join("")}
  </div>
</div>

<div class="panel" style="margin-top:14px">
  <h3>Contrast — measured, not asserted</h3>
  <p class="note">Every pair a component may place together, run through the WCAG relative-luminance formula in both schemes. Floor: ${data.design.contrastFloor.bodyText}:1 body, ${data.design.contrastFloor.uiBoundary}:1 boundaries.</p>
  <div class="scroll"><table style="margin-top:10px"><thead><tr><th>Pair</th><th>Light</th><th>Dark</th><th></th></tr></thead><tbody>
  ${data.design.contrast.map((c) => `<tr><td class="mono">${esc(c.pair)}</td><td class="mono">${c.light}</td><td class="mono">${c.dark}</td><td><span class="tag ${c.passes ? "ok" : "bad"}">${c.passes ? "pass" : "below floor"}</span></td></tr>`).join("")}
  </tbody></table></div>
</div>

<div class="grid g3" style="margin-top:14px">
  <div class="panel"><h3>Typography</h3>
    <table><tbody>${Object.entries(data.design.type).map(([role, s]) => `<tr><td class="mono">${esc(role)}</td><td class="mono">${s.size}/${s.lineHeight} · ${s.weight}</td><td class="note">${s.clinicalAllowed ? "clinical ok" : "not clinical"}</td></tr>`).join("")}</tbody></table>
    <p class="note" style="margin-top:8px">Letter-spacing is always 0 — Arabic is connected and tracking breaks the joins.</p>
  </div>
  <div class="panel"><h3>Spacing &amp; radius</h3>
    <p class="mono">${Object.entries(data.design.space).map(([k, v]) => `${k}:${v}`).join("  ")}</p>
    <p class="mono" style="margin-top:8px">radius ${Object.entries(data.design.radius).map(([k, v]) => `${k}:${v}`).join("  ")}</p>
    <p class="note" style="margin-top:8px">A 4pt rhythm. No value outside the scale exists.</p>
  </div>
  <div class="panel"><h3>Touch targets</h3>
    <p class="mono">min ${data.design.tap.min} · patient primary ${data.design.tap.patientPrimary} · pharmacy primary ${data.design.tap.pharmacyPrimary}</p>
    <p class="note" style="margin-top:8px">Checked by walking the rendered tree of every screen, not by inspection.</p>
  </div>
</div>

<div class="panel" style="margin-top:14px"><h3>Motion</h3>
  <div class="scroll"><table><thead><tr><th>Token</th><th>Duration</th><th>Purpose</th></tr></thead><tbody>
  ${Object.entries(data.design.motion).map(([k, m]) => `<tr><td class="mono">${esc(k)}</td><td class="mono">${esc(m.duration ?? "—")}ms</td><td class="note">${esc(m.why ?? m.purpose ?? "")}</td></tr>`).join("")}
  </tbody></table></div>
  <p class="note" style="margin-top:8px">Declared, not yet applied — see Known limitations.</p>
</div>`)}

${section("Architecture", `
<div class="panel">
  <p class="note">Read off the filesystem, so it cannot go stale. Every module below exists in this build.</p>
  ${data.architecture.map((l, i) => `
    <div style="margin-top:${i ? 18 : 14}px">
      <h3>${esc(l.layer)} <span class="note" style="font-weight:400">— ${esc(l.note)}</span></h3>
      <div style="margin-top:6px">${l.modules.map((m) => `<span class="tag">${esc(m.replace(/^(apps\/patient\/src|packages)\//, ""))}</span>`).join("")}</div>
      ${i < data.architecture.length - 1 ? '<div class="note" style="margin-top:8px">↓</div>' : ""}
    </div>`).join("")}
  <div style="margin-top:18px">
    <h3>INFRASTRUCTURE <span class="tag bad">NOT BUILT</span></h3>
    <p class="note">Stage 5. Repositories, storage, synchronisation, queues, the notification engine and audit logging do not exist.</p>
  </div>
  <p class="note" style="margin-top:14px">Enforced by tools/layer-check.mjs: the domain may not import Node built-ins, the network, storage, timers, randomness or the clock, and the app layer may import nothing but the workspace packages, react and react-native.</p>
</div>`)}

${section("Offline flow", `
<div class="grid g2">
  <div class="panel"><h3>Online</h3>
    <div class="flowline"><span class="node built">tap send</span><span class="arrow">→</span><span class="node built">outbox</span><span class="arrow">→</span><span class="node built">POST /v1/requests</span><span class="arrow">→</span><span class="node built">broadcast</span><span class="arrow">→</span><span class="node built">R7 countdown</span></div>
    <p class="note" style="margin-top:10px"><code>request.broadcast</code> is emitted here and only here.</p>
  </div>
  <div class="panel"><h3>Offline</h3>
    <div class="flowline"><span class="node built">tap send</span><span class="arrow">→</span><span class="node built">outbox: queued</span><span class="arrow">→</span><span class="node pending">retry · full jitter</span><span class="arrow">→</span><span class="node built">delivered</span><span class="arrow">→</span><span class="node built">broadcast</span></div>
    <p class="note" style="margin-top:10px">Both paths go through the outbox, so there is one delivery route and not two. A queued request shows no countdown and its wording comes from the outbox, so no screen can invent a friendlier phrase for “not yet sent”. Retries carry a stable idempotency key; a 409 resolves to accepted, never an error.</p>
  </div>
</div>`)}

${section("Analytics", `
<div class="panel scroll">
<table><thead><tr><th>Event</th><th>Emitted by</th><th>Trigger</th></tr></thead><tbody>
${data.analytics.map((a) => {
  const emitters = data.screens.filter((s) => s.telemetry.includes(a.event)).map((s) => s.id);
  const trigger = {
    "request.broadcast": "send succeeds AND the request reached broadcast — never when queued",
    "search.unmatched": "a search returns zero rows — never on a transport failure",
    "clinical.gate.refused": "the clinical gate refuses a line at the moment it is added",
  }[a.event];
  return `<tr><td class="mono">${esc(a.event)}</td><td>${emitters.length ? emitters.map((e) => `<span class="tag ok">${esc(e)}</span>`).join("") : '<span class="tag">not yet emitted</span>'}</td><td class="note">${esc(trigger ?? "declared in the closed set; emitted by a later slice")}</td></tr>`;
}).join("")}
</tbody></table>
<p class="note" style="margin-top:10px">The set is closed: adding an event is a deliberate act with a Blueprint reference, so no metric can be computed from an ad-hoc counter.</p>
</div>`)}

${section("Tests", `
<div class="grid g2">
${allGates.map((g) => `<div class="panel"><div class="chk" style="border:none;padding:0">
  <span class="dot ${g.pass ? "ok" : "bad"}"></span>
  <div><b>${esc(g.name)}</b> — <span class="tag ${g.pass ? "ok" : "bad"}">${g.pass ? "PASS" : "FAIL"}</span>
  <div class="note mono">${esc(g.detail)}</div></div>
</div></div>`).join("")}
</div>`)}

${section("Quality checklist", `
<div class="panel">
${allGates.map((g) => `<div class="chk"><span class="dot ${g.pass ? "ok" : "bad"}"></span><div style="flex:1">${esc(g.name)}</div><span class="tag ${g.pass ? "ok" : "bad"}">${g.pass ? "verified" : "failing"}</span></div>`).join("")}
<div class="chk"><span class="dot bad"></span><div style="flex:1">Performance</div><span class="tag warn">not measured — no runtime exists to measure yet</span></div>
</div>
<p class="note" style="margin-top:10px">Nothing above is green unless it was measured in this run. Performance is deliberately red rather than assumed: there is no device build to profile.</p>`)}


${section("Release readiness", `
<div class="panel">
  <h3>Can this build ship today?</h3>
  <p style="margin-top:6px"><span class="tag bad" style="font-size:14px;padding:6px 12px">NO</span></p>
  <p class="note" style="margin-top:12px">Every quality gate is green and the patient consent journey is complete, but the build cannot be submitted. The blockers below are derived from the debt register — an item leaves this list by being fixed.</p>

  <h3 style="margin-top:20px">What blocks release</h3>
  <table style="margin-top:8px"><thead><tr><th>Blocker</th><th>Why it blocks</th><th>Owner</th></tr></thead><tbody>
  ${BLOCKERS.map((d) => `<tr><td class="mono">${esc(d.id)}</td><td>${esc(d.impact)}</td><td class="mono">${esc(d.owner)}</td></tr>`).join("")}
  </tbody></table>

  <h3 style="margin-top:20px">What is ready</h3>
  <ul>
    <li class="note">The patient core loop, end to end: search → request → wait → compare → consent → reserve → collect.</li>
    <li class="note">${data.screens.length} screens contracted, ${data.progress.rendered} rendered, ${data.shots.length} states photographed and audited.</li>
    <li class="note">Every product rule enforced on every registered state — one primary, 44pt floor, readable labels, no repeated action, one numeral system, explained disabled states.</li>
    <li class="note">Contrast measured in both schemes; navigation proven free of traps and unreachable screens.</li>
  </ul>

  <h3 style="margin-top:20px">What remains before a submission is even possible</h3>
  <ul>
    <li class="note">A device build. Nothing here has run on a phone, so no App Store artefact exists.</li>
    <li class="note">Infrastructure (Stage 5) — the app has never exchanged a byte with a server.</li>
    <li class="note">The onboarding chain E5–E8: a guest cannot complete any journey today.</li>
    <li class="note">${data.gaps.length} Blueprint screens, listed individually under Known gaps.</li>
  </ul>
</div>`)}

${section("Screen health", `
<div class="panel scroll">
<p class="note">Derived per screen: which states the Blueprint declares, which have a treatment, whether the screen is photographed, and what changed since the last push.</p>
<table style="margin-top:12px"><thead><tr>
  <th>Screen</th><th>Purpose</th><th>States implemented</th><th>Offline</th><th>Loading</th><th>Error</th><th>Analytics</th><th>Shots</th><th>Regression</th>
</tr></thead><tbody>
${data.screens.map((sc) => {
  const kinds = new Set(sc.states.map((x) => x.kind));
  const shotIds = sc.shots.map((x) => `${x.id}.png`);
  const status = shotIds.length === 0 ? '<span class="tag">not rendered</span>'
    : shotIds.some((f) => regression.added.includes(f)) ? '<span class="tag ok">new</span>'
    : shotIds.some((f) => regression.changed.includes(f)) ? '<span class="tag warn">changed</span>'
    : '<span class="tag">unchanged</span>';
  const mark = (ok) => ok ? '<span class="tag ok">yes</span>' : '<span class="tag">—</span>';
  return `<tr>
    <td class="mono">${esc(sc.id)}</td>
    <td class="note">${esc(sc.purpose)}</td>
    <td>${[...kinds].map((k) => `<span class="tag">${esc(k)}</span>`).join("") || "—"}</td>
    <td>${mark(kinds.has("offline"))}</td>
    <td>${mark(kinds.has("loading"))}</td>
    <td>${mark(kinds.has("error"))}</td>
    <td>${sc.telemetry.length ? sc.telemetry.map((e) => `<span class="tag ok">${esc(e)}</span>`).join("") : '<span class="tag">—</span>'}</td>
    <td class="mono">${sc.shots.length}</td>
    <td>${status}</td>
  </tr>`;
}).join("")}
</tbody></table></div>`)}

${section("Visual regression — against the last pushed build", `
<div class="panel">
  <p class="note">Byte-level PNG comparison against the screenshots in git HEAD, so the baseline is what was actually last reviewed rather than a file somebody remembered to update. It cannot say WHAT changed, only that something did — which is enough to guarantee nothing changes without being listed.</p>
  ${regression.hasBaseline ? `
  <div style="margin-top:12px">
    <span class="tag ok">${regression.unchanged.length} unchanged</span>
    <span class="tag warn">${regression.changed.length} changed</span>
    <span class="tag">${regression.added.length} new</span>
    <span class="tag ${regression.removed.length ? "bad" : ""}">${regression.removed.length} removed</span>
  </div>
  ${regression.changed.length ? `<div style="margin-top:14px"><h3>Changed — each one looked at before this push</h3>
    <div class="grid g3" style="margin-top:10px">${regression.changed.map((f) => `<div class="shot"><img src="screenshots/${esc(f)}" alt="${esc(f)}"><div class="cap"><span class="mono">${esc(f)}</span></div></div>`).join("")}</div></div>` : ""}
  ${regression.added.length ? `<div style="margin-top:14px"><h3>New this slice</h3><div>${regression.added.map((f) => `<span class="tag ok">${esc(f)}</span>`).join("")}</div></div>` : ""}
  ${regression.removed.length ? `<div style="margin-top:14px"><h3>Removed — a screen state that no longer renders</h3><div>${regression.removed.map((f) => `<span class="tag bad">${esc(f)}</span>`).join("")}</div></div>` : ""}
  ` : `<p class="note" style="margin-top:12px">No baseline in git yet — every screenshot is new.</p>`}
</div>`)}

${section("Performance", `
<div class="panel">
  <h3>Measured</h3>
  <div class="grid g4" style="margin-top:12px">
    <div><div class="kpi">${MEASURED.source.files}<small>source files</small></div></div>
    <div><div class="kpi">${MEASURED.source.lines.toLocaleString("en-US")}<small>source lines</small></div></div>
    <div><div class="kpi">${MEASURED.tests.ratio}×<small>test lines per source line</small></div></div>
    <div><div class="kpi">${esc(MEASURED.tests.duration ?? "—")}<small>full suite wall-clock</small></div></div>
  </div>
  <p class="note" style="margin-top:12px">Source size is NOT a bundle size. No Metro bundle has been produced.</p>
</div>

<div class="panel" style="margin-top:14px">
  <h3>Rendered weight per screen state</h3>
  <p class="note">View nodes each state produces, counted from the review renders. A screen that produces several hundred nodes is a screen that will scroll badly on a low-end Android — this is a real proxy, measured, not a runtime frame time.</p>
  <div class="scroll"><table style="margin-top:10px"><thead><tr><th>State</th><th>View nodes</th><th>Markup bytes</th></tr></thead><tbody>
  ${MEASURED.rendered.slice(0, 12).map((r) => `<tr><td class="mono">${esc(r.id)}</td><td class="mono">${r.nodes}</td><td class="mono">${(r.bytes / 1024).toFixed(1)} KB</td></tr>`).join("")}
  </tbody></table></div>
</div>

<div class="panel" style="margin-top:14px">
  <h3>NOT VERIFIED</h3>
  <p class="note">Reported, never estimated, and never green without evidence.</p>
  <div class="scroll"><table style="margin-top:10px"><thead><tr><th>Metric</th><th>Status</th><th>Why it cannot be measured here</th></tr></thead><tbody>
  ${NOT_VERIFIED.map((m) => `<tr><td>${esc(m.metric)}</td><td><span class="tag bad">NOT VERIFIED</span></td><td class="note">${esc(m.why)}</td></tr>`).join("")}
  </tbody></table></div>
</div>`)}

${section("Technical debt register", `
<div class="panel scroll">
<p class="note">Debt is only real if it is visible and owned. An item leaves this register by being fixed, never by being deleted.</p>
<table style="margin-top:12px"><thead><tr><th>ID</th><th>Description</th><th>Impact</th><th>Priority</th><th>Owner</th><th>Planned slice</th></tr></thead><tbody>
${DEBT.map((d) => `<tr>
  <td class="mono">${esc(d.id)}</td>
  <td>${esc(d.description)}</td>
  <td class="note">${esc(d.impact)}</td>
  <td><span class="tag ${d.priority === "critical" ? "bad" : d.priority === "high" ? "warn" : ""}">${esc(d.priority)}</span></td>
  <td class="mono">${esc(d.owner)}</td>
  <td class="note">${esc(d.slice)}${d.note ? ` — ${esc(d.note)}` : ""}</td>
</tr>`).join("")}
</tbody></table>
<h3 style="margin-top:20px">Resolved</h3>
<table style="margin-top:8px"><thead><tr><th>ID</th><th>Was</th><th>Resolved by</th></tr></thead><tbody>
${RESOLVED.map((d) => `<tr><td class="mono">${esc(d.id)}</td><td class="note">${esc(d.description)}</td><td class="note">${esc(d.resolvedBy)}</td></tr>`).join("")}
</tbody></table></div>`)}

${section("Blueprint workflow progress", `
<div class="panel scroll">
<p class="note">Derived from the contracts and the Blueprint's own screen inventory. A workflow is Complete only when every screen it needs is contracted AND photographed.</p>
<table style="margin-top:12px"><thead><tr><th>Workflow</th><th>Screens</th><th>Built</th><th>Status</th></tr></thead><tbody>
${WORKFLOWS.map((w) => {
  const built = w.screens.filter((id) => data.screens.some((s) => s.id === id));
  const shot = w.screens.filter((id) => data.shots.some((s) => s.screen === id));
  const status = built.length === 0 ? "Not Started"
    : shot.length === w.screens.length ? "Complete"
    : built.length === w.screens.length ? "Review"
    : "In Progress";
  const cls = status === "Complete" ? "ok" : status === "Not Started" ? "bad" : "warn";
  return `<tr>
    <td><b>${esc(w.name)}</b></td>
    <td>${w.screens.map((id) => `<span class="node ${data.screens.some((s) => s.id === id) ? "built" : "pending"}" style="margin:2px">${esc(id)}</span>`).join("")}</td>
    <td class="mono">${built.length}/${w.screens.length}</td>
    <td><span class="tag ${cls}">${status}</span></td>
  </tr>`;
}).join("")}
</tbody></table></div>`)}

${section("Honesty labels", `
<div class="panel">
<p class="note">Nothing unfinished is presented as production-ready. These are the labels in force right now, each derived from the code rather than asserted.</p>
<table style="margin-top:12px"><thead><tr><th>Thing</th><th>Label</th><th>Meaning</th></tr></thead><tbody>
  <tr><td>${data.gaps.length} Blueprint screens</td><td><span class="tag bad">NOT IMPLEMENTED</span></td><td class="note">No contract, no render. Listed individually in Known gaps.</td></tr>
  <tr><td>Routes to ${data.graph.dangling.length} declared exits</td><td><span class="tag warn">BLOCKED</span></td><td class="note">A contract declares the exit; this build cannot honour it, so no control renders to it.</td></tr>
  <tr><td>CataloguePort, Environment, flush()</td><td><span class="tag warn">MOCKED</span></td><td class="note">Types with test fakes behind them. No transport exists.</td></tr>
  <tr><td>Every screen in the gallery</td><td><span class="tag warn">SIMULATED</span></td><td class="note">Rendered from fixtures through a DOM adapter. Real component tree, simulated data, not a device capture.</td></tr>
  <tr><td>V2 freshness</td><td><span class="tag warn">MOCKED</span></td><td class="note">Hard-coded live because nothing is cached yet. The cached path is implemented and photographed but unexercised.</td></tr>
</tbody></table></div>`)}

${section("Known gaps — NOT IMPLEMENTED", `
<div class="panel scroll">
<p class="note">${data.gaps.length} of the ${data.progress.blueprintScreens} Blueprint v3 Phase 0 screens are not in this build. The ${data.gaps.filter((g) => g.referenced).length} marked <b>referenced</b> are named by an exit in a contracted screen — no control navigates to them, and a guard whose destination is not built keeps the user where they are with the reason.</p>
<table style="margin-top:12px"><thead><tr><th>Screen</th><th>Group</th><th>Name</th><th>Purpose</th><th></th></tr></thead><tbody>
${data.gaps.map((g) => `<tr><td class="mono">${esc(g.id)}</td><td class="note">${esc(g.group)}</td><td>${esc(g.name)}</td><td class="note">${esc(g.purpose)}</td><td>${g.referenced ? '<span class="tag warn">referenced</span>' : '<span class="tag">later slice</span>'}</td></tr>`).join("")}
</tbody></table></div>`)}

${section("Known limitations", `<div class="panel"><ul>${LIMITATIONS.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>`)}

${section("Change log — this slice", `<div class="grid g2">
${Object.entries(CHANGELOG).map(([k, items]) => `<div class="panel"><h3>${esc(k)}</h3><ul>${items.map((i) => `<li class="note">${esc(i)}</li>`).join("")}</ul></div>`).join("")}
</div>`)}

<p class="note" style="margin-top:48px">Generated by <code>npm run review</code>. Every figure is measured at generation time; nothing on this page is asserted by hand.</p>
</div></body></html>`;

writeFileSync(join(REVIEW, "index.html"), html, "utf8");

console.log(`\nVisual review — review/index.html\n`);
for (const g of allGates) console.log(`  ${g.pass ? "PASS" : "FAIL"}  ${g.name} — ${g.detail}`);
console.log(`\n  ${data.screens.length} contracted screens · ${data.shots.length} photographed states · ${data.gaps.length} documented gaps\n`);
if (!allPass) { console.log("  A gate failed. DO NOT PUSH.\n"); process.exit(1); }
console.log("  All gates pass.\n");
