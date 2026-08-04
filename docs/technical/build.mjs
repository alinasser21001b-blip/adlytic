#!/usr/bin/env node
/* Generates the eleven technical documents from model.js and validation.json.
 * The documents are OUTPUTS. Edit model.js, never the HTML — a hand-edited
 * generated file is a second source of truth wearing a disguise.
 *
 *   node docs/technical/validate.mjs && node docs/technical/build.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const w = {};
new Function("window", readFileSync(join(HERE, "model.js"), "utf8"))(w);
const T = w.TECH;
const V = existsSync(join(HERE, "validation.json"))
  ? JSON.parse(readFileSync(join(HERE, "validation.json"), "utf8")) : null;
if (!V) { console.error("Run validate.mjs first."); process.exit(1); }

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const bp = (s) => `<span class="bp" title="Blueprint v3 reference">${esc(s)}</span>`;
const svc = (id) => `<code>${esc(id)}</code>`;

const DOCS = [
  ["01-system-architecture", "System Architecture"],
  ["02-domain-model", "Domain Model"],
  ["03-service-boundaries", "Service Boundaries"],
  ["04-event-architecture", "Event Architecture"],
  ["05-api-contracts", "API Contracts"],
  ["06-database-architecture", "Database Architecture"],
  ["07-mobile-navigation", "Mobile Navigation"],
  ["08-security-architecture", "Security Architecture"],
  ["09-testing-strategy", "Testing Strategy"],
  ["10-release-architecture", "Release Architecture"],
  ["11-validation-report", "Validation Report"],
];

const CSS = `
:root{--bg:#fbfaf7;--panel:#fff;--line:#e2e0d8;--line2:#cfccc0;--ink:#16211d;--ink2:#4b5b55;--ink3:#6d7d76;
--accent:#1f6f52;--soft:#e8f2ed;--warn:#8a5a12;--warn-bg:#fbf1de;--bad:#8c3a2c;--bad-bg:#fbe9e5;
--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;--r:10px}
@media(prefers-color-scheme:dark){:root{--bg:#101614;--panel:#161e1b;--line:#26332e;--line2:#35453f;--ink:#eef3f1;--ink2:#a9bab3;--ink3:#849790;--accent:#5ec89a;--soft:#16302a;--warn:#e2b46b;--warn-bg:#33280f;--bad:#f0917f;--bad-bg:#3a1f19}}
:root[data-theme=dark]{--bg:#101614;--panel:#161e1b;--line:#26332e;--line2:#35453f;--ink:#eef3f1;--ink2:#a9bab3;--ink3:#849790;--accent:#5ec89a;--soft:#16302a;--warn:#e2b46b;--warn-bg:#33280f;--bad:#f0917f;--bad-bg:#3a1f19}
:root[data-theme=light]{--bg:#fbfaf7;--panel:#fff;--line:#e2e0d8;--line2:#cfccc0;--ink:#16211d;--ink2:#4b5b55;--ink3:#6d7d76;--accent:#1f6f52;--soft:#e8f2ed;--warn:#8a5a12;--warn-bg:#fbf1de;--bad:#8c3a2c;--bad-bg:#fbe9e5}
*{box-sizing:border-box}html{background:var(--bg);scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.62 var(--sans);-webkit-text-size-adjust:100%}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important;animation:none!important}}
h1{font-size:1.85rem;margin:0 0 .3rem;line-height:1.25}h2{font-size:1.32rem;margin:2.4rem 0 .4rem;line-height:1.3}
h3{font-size:1.02rem;margin:1.5rem 0 .35rem}p{margin:.65rem 0}
code{font-family:var(--mono);font-size:.87em;background:var(--soft);padding:.06em .34em;border-radius:5px}
a{color:var(--accent)}
.wrap{display:grid;grid-template-columns:250px minmax(0,1fr);min-height:100vh}
aside{position:sticky;top:0;height:100vh;overflow-y:auto;border-inline-end:1px solid var(--line);background:var(--panel);padding:1.1rem .8rem 3rem}
main{min-width:0;padding:1.6rem clamp(1rem,4vw,3rem) 6rem;max-width:1160px}
.brand{display:flex;gap:.6rem;align-items:center}.mark{width:32px;height:32px;border-radius:9px;background:var(--accent);color:var(--bg);display:grid;place-items:center;font-weight:800;flex:none}
.brand small{display:block;color:var(--ink3);font-size:.68rem;font-weight:700;letter-spacing:.04em}.brand b{font-size:.9rem}
nav{margin-top:1rem}nav a{display:block;padding:.4rem .6rem;border-radius:8px;color:var(--ink2);text-decoration:none;font-size:.84rem;line-height:1.35}
nav a:hover{background:var(--soft);color:var(--ink)}nav a.on{background:var(--soft);color:var(--ink);font-weight:650}
nav .grp{font-size:.66rem;text-transform:uppercase;letter-spacing:.07em;color:var(--ink3);margin:1rem .6rem .25rem;font-weight:700}
.themebtn{margin-top:1rem;width:100%;min-height:36px;border:1px solid var(--line2);background:transparent;color:var(--ink2);border-radius:8px;cursor:pointer;font:inherit;font-size:.8rem}
.lede{font-size:1.03rem;color:var(--ink2);max-width:72ch}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:.95rem 1.05rem;margin:.9rem 0}
.rule{border-inline-start:3px solid var(--accent);background:var(--soft);padding:.75rem 1rem;border-radius:0 var(--r) var(--r) 0;margin:1rem 0}
.rule b:first-child{display:block;font-size:.7rem;text-transform:uppercase;letter-spacing:.07em;color:var(--accent);margin-bottom:.2rem}
/* A Blueprint reference can be long ("§4 PA1–PA9 and P1–P31"). nowrap made it
   push the page 155px wide on a phone — measured, not guessed. */
.bp{display:inline;font:700 .66rem var(--mono);background:var(--soft);color:var(--ink2);padding:.06rem .36rem;border-radius:5px;overflow-wrap:anywhere}
/* Definition values hold long identifiers, paths and payloads. Grid children
   default to min-width:auto, which refuses to shrink below their content. */
dl.kv dd,dl.kv dt,.card,.card header,.card header b{min-width:0}
dl.kv dd code,dl.kv dd,td code,td,li code,p code{overflow-wrap:anywhere}
/* An endpoint path or a request schema is one unbroken token wider than a
   320px screen. overflow-wrap alone is not enough inside a flex header. */
.card header b code,.card header b{overflow-wrap:anywhere;word-break:break-word}
li{overflow-wrap:anywhere}
table{width:100%;border-collapse:collapse;margin:.85rem 0;font-size:.88rem}
th,td{text-align:start;padding:.5rem .55rem;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3);white-space:nowrap}
tbody tr:hover{background:var(--soft)}.tw{overflow-x:auto;-webkit-overflow-scrolling:touch}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:.85rem .95rem;margin:.6rem 0}
.card header{display:flex;gap:.5rem;align-items:baseline;flex-wrap:wrap;margin-bottom:.35rem}
.card header b{flex:1 1 220px;min-width:0}
dl.kv{display:grid;grid-template-columns:132px minmax(0,1fr);gap:.12rem .8rem;margin:.4rem 0 0;font-size:.86rem}
dl.kv dt{font-size:.66rem;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3);font-weight:700;padding-top:.26rem}
dl.kv dd{margin:0}
@media(max-width:640px){dl.kv{grid-template-columns:1fr}dl.kv dt{padding-top:.45rem}}
ul,ol{padding-inline-start:1.25rem;margin:.5rem 0}li{margin:.25rem 0}
.forbid li{color:var(--bad)}
pre.mermaid{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:1rem;overflow-x:auto;font-family:var(--mono);font-size:.79rem;line-height:1.45;color:var(--ink2);white-space:pre;margin:1rem 0}
pre.mermaid[data-processed]{white-space:normal;text-align:center}
.cap{font-size:.77rem;color:var(--ink3);margin:-.6rem 0 1.1rem}
.pill{display:inline-block;padding:.08rem .48rem;border-radius:999px;font:800 .66rem var(--sans);white-space:nowrap}
.ok{background:var(--soft);color:var(--accent)}.wa{background:var(--warn-bg);color:var(--warn)}.ba{background:var(--bad-bg);color:var(--bad)}
.kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:.65rem;margin:1rem 0}
.kpi div{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:.75rem}
.kpi span{display:block;font-size:.72rem;color:var(--ink3);font-weight:600}
.kpi strong{display:block;font:700 1.4rem/1.2 var(--mono);margin-top:.1rem}
.filters{display:flex;gap:.4rem;flex-wrap:wrap;align-items:center;margin:.9rem 0;position:sticky;top:0;background:var(--bg);padding:.55rem 0;z-index:5;border-bottom:1px solid var(--line)}
.filters button{min-height:34px;padding:.2rem .68rem;border:1px solid var(--line2);background:transparent;color:var(--ink2);border-radius:999px;cursor:pointer;font:inherit;font-size:.79rem;font-weight:600}
.filters button.on{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.filters input{min-height:34px;flex:1 1 150px;min-width:0;border:1px solid var(--line2);background:var(--panel);color:var(--ink);border-radius:8px;padding:.2rem .6rem;font:inherit;font-size:16px}
.gen{color:var(--ink3);font-size:.78rem;margin-top:2.5rem;border-top:1px solid var(--line);padding-top:.8rem}
@media(max-width:860px){.wrap{grid-template-columns:1fr}aside{position:static;height:auto;border-inline-end:0;border-bottom:1px solid var(--line)}
nav{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:.1rem}nav .grp{grid-column:1/-1}}
@media print{aside,.filters,.themebtn{display:none!important}.wrap{display:block}main{max-width:none;padding:0}.card,.panel{break-inside:avoid}body{font-size:11px;background:#fff;color:#111}}
`;

const JS = `
const root=document.documentElement;
const tb=document.getElementById('theme');
if(tb)tb.onclick=()=>{const c=root.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');root.setAttribute('data-theme',c==='dark'?'light':'dark')};
document.querySelectorAll('.filters').forEach(bar=>{
  const target=bar.dataset.target, inp=bar.querySelector('input'), cnt=bar.querySelector('.cnt');
  let key='all', q='';
  const apply=()=>{let n=0;
    document.querySelectorAll('#'+target+' [data-k]').forEach(el=>{
      const ok=(key==='all'||el.dataset.k===key)&&(!q||el.dataset.s.includes(q));
      el.hidden=!ok; if(ok)n++;});
    if(cnt)cnt.textContent=n+' shown';};
  bar.addEventListener('click',e=>{const b=e.target.closest('button[data-f]');if(!b)return;
    bar.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));key=b.dataset.f;apply();});
  if(inp)inp.addEventListener('input',e=>{q=e.target.value.trim().toLowerCase();apply();});
  apply();
});
const links=[...document.querySelectorAll('#toc a')];
if(links.length){const obs=new IntersectionObserver(es=>{es.forEach(e=>{if(!e.isIntersecting)return;
  links.forEach(a=>a.classList.toggle('on',a.getAttribute('href')==='#'+e.target.id))})},{rootMargin:'-10% 0px -80% 0px'});
  document.querySelectorAll('main section[id]').forEach(s=>obs.observe(s));}
(function(){const s=document.createElement('script');
 s.src='https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
 s.onload=()=>{const d=root.getAttribute('data-theme')==='dark'||(!root.getAttribute('data-theme')&&matchMedia('(prefers-color-scheme:dark)').matches);
   mermaid.initialize({startOnLoad:true,theme:d?'dark':'neutral',themeVariables:{fontFamily:'ui-sans-serif,system-ui,sans-serif'}});};
 s.onerror=()=>document.querySelectorAll('pre.mermaid').forEach(p=>p.insertAdjacentHTML('beforebegin','<p class="cap">Diagram renderer unavailable — the source below is the diagram.</p>'));
 document.head.appendChild(s);})();
`;

function page(slug, title, toc, body) {
  const nav = DOCS.map(([s, t]) =>
    `<a href="${s}.html"${s === slug ? ' class="on"' : ""}>${t.replace(/^/, DOCS.findIndex(d => d[0] === s) + 1 + " · ")}</a>`).join("\n    ");
  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Dawai Technical — ${esc(title)}</title>
<style>${CSS}</style>
</head>
<body><div class="wrap">
<aside>
  <div class="brand"><div class="mark">د</div><div><small>DAWAI · TECHNICAL</small><b>${esc(title)}</b></div></div>
  <div style="font-size:.72rem;color:var(--ink3);padding:.4rem .6rem 0">Derived from Blueprint v3 · frozen</div>
  <nav>
    <div class="grp">Documents</div>
    ${nav}
    <div class="grp">Source</div>
    <a href="../product/v3/blueprint-v3.html">Blueprint v3</a>
  </nav>
  ${toc ? `<nav id="toc"><div class="grp">On this page</div>${toc}</nav>` : ""}
  <button class="themebtn" id="theme">Toggle theme</button>
</aside>
<main>
${body}
<p class="gen">Generated from <code>docs/technical/model.js</code> by <code>build.mjs</code>. Do not edit this file — edit the model. Architecture validation: ${V.checks.filter(c => c.pass).length}/${V.checks.length} checks passing.</p>
</main></div>
<script>${JS}</script>
</body></html>`;
}
const toc = (items) => items.map(([id, t]) => `<a href="#${id}">${esc(t)}</a>`).join("");

/* ── 01 System architecture ───────────────────────────────────────────── */
{
  const clients = T.services.filter(s => s.kind === "client");
  const rest = T.services.filter(s => s.kind !== "client");
  const body = `
<h1>System Architecture</h1>
<p class="lede">Twelve components. Three clients, one edge, eight services. Every
one derives from Blueprint v3 and none introduces behaviour the Blueprint does
not already specify.</p>

<div class="kpi">
<div><span>Components</span><strong>${T.services.length}</strong></div>
<div><span>Entities</span><strong>${T.entities.length}</strong></div>
<div><span>Events</span><strong>${T.events.length}</strong></div>
<div><span>Endpoints</span><strong>${T.endpoints.length}</strong></div>
</div>

<section id="shape"><h2>The shape</h2>
<pre class="mermaid">graph TB
  subgraph Clients
    PA["Patient App"]
    PH["Pharmacy App"]
    OW["Owner Console"]
  end
  GW["API Gateway<br/>authn · audience · idempotency · rate limit"]
  subgraph Core["Core services"]
    ID["Identity Service"]
    MK["Marketplace Engine"]
    CL["Clinical Engine"]
    CAT["Catalogue Service"]
    PHS["Pharmacy Service"]
    MED["Media Service"]
  end
  subgraph Platform
    NOT["Notification Service"]
    AUD["Audit Service"]
  end
  PA --> GW
  PH --> GW
  OW --> GW
  GW --> ID & MK & CL & CAT & PHS & MED & NOT & AUD
  MK --> ID & CAT & PHS & CL
  CL --> CAT & PHS & ID
  PHS --> ID
  MED --> ID
  ID --> AUD
  MK --> AUD
  CL --> AUD
  CAT --> AUD
  PHS --> AUD
  MED --> AUD
  ID -. events .-> NOT
  MK -. events .-> NOT
  PHS -. events .-> NOT
  NOT --> ID
  NOT -. push .-> PA
  NOT -. push .-> PH</pre>
<p class="cap">Solid lines are synchronous calls; dotted lines are events. The
notifier is reached only by event, never by a call — a direct dependency would
make a cycle and couple the core to delivery. The validator enforces this.</p>
</section>

<section id="clients"><h2>Clients</h2>
${clients.map(s => `<div class="card"><header><b>${esc(s.name)}</b> ${bp(s.bp)}</header>
<dl class="kv"><dt>Responsibilities</dt><dd><ul>${s.resp.map(r => `<li>${esc(r)}</li>`).join("")}</ul></dd>
<dt>Must never</dt><dd><ul class="forbid">${s.forbidden.map(r => `<li>${esc(r)}</li>`).join("")}</ul></dd></dl></div>`).join("")}
</section>

<section id="services"><h2>Edge and services</h2>
${rest.map(s => `<div class="card"><header><b>${esc(s.name)}</b> <code>${esc(s.id)}</code> ${bp(s.bp)}</header>
<dl class="kv"><dt>Responsibilities</dt><dd><ul>${s.resp.map(r => `<li>${esc(r)}</li>`).join("")}</ul></dd>
<dt>Depends on</dt><dd>${s.deps.length ? s.deps.map(svc).join(" · ") : "nothing"}</dd>
<dt>Must never</dt><dd><ul class="forbid">${s.forbidden.map(r => `<li>${esc(r)}</li>`).join("")}</ul></dd></dl></div>`).join("")}
</section>

<section id="deps"><h2>Dependency graph</h2>
<pre class="mermaid">graph LR
${T.services.filter(s => s.deps.length).map(s => s.deps.map(d => `  ${s.id.replace(/-/g, "_")} --> ${d.replace(/-/g, "_")}`).join("\n")).join("\n")}</pre>
<p class="cap">Acyclic, verified by the validator. The first draft of this model
contained <code>identity-service → notification-service → identity-service</code>;
the validator caught it and the fix was to make the notifier event-driven only.</p>
</section>

<div class="rule"><b>The rule this architecture is built on</b>
No component introduces business logic. Every behaviour here exists because
Blueprint v3 specifies it, and every element carries the reference. Where the
Blueprint does not specify something the implementation needs, it is recorded
as a gap in <a href="11-validation-report.html">the validation report</a> —
never invented.</div>`;
  writeFileSync(join(HERE, "01-system-architecture.html"),
    page("01-system-architecture", "System Architecture",
      toc([["shape", "The shape"], ["clients", "Clients"], ["services", "Services"], ["deps", "Dependency graph"]]), body));
}

/* ── 02 Domain model ──────────────────────────────────────────────────── */
{
  const body = `
<h1>Domain Model</h1>
<p class="lede">${T.entities.length} entities, every one from Blueprint v3 §2.
No entity was added. Each declares its purpose, owner, states with the exact
implementation path that produces them, events, relationships and invariants.</p>

<div class="rule"><b>Two invariants that hold across every entity</b>
<b>1.</b> Every clinical read and write names a <b>subject</b> and an
<b>acting account</b> separately — they are frequently different people.<br>
<b>2.</b> Nothing clinical is edited or deleted. Corrections are new records;
no role holds the permission and no operation performs it.</div>

<div class="filters" data-target="ents">
  <button data-f="all" class="on">All</button>
  ${[...new Set(T.entities.map(e => e.svc))].map(s => `<button data-f="${esc(s)}">${esc(s.replace("-service", "").replace("-engine", ""))}</button>`).join("")}
  <input type="search" placeholder="Search entities, states, invariants…" aria-label="Search entities">
  <span class="cnt" style="font-size:.79rem;color:var(--ink3)"></span>
</div>
<div id="ents">
${T.entities.map(e => `<div class="card" data-k="${esc(e.svc)}" data-s="${esc([e.id, e.purpose, e.svc, e.states.map(s => s.s + " " + s.by).join(" "), e.inv.join(" ")].join(" ")).toLowerCase()}">
<header><b>${esc(e.id)}</b> <code>${esc(e.svc)}</code> ${bp(e.bp)}</header>
<dl class="kv">
<dt>Purpose</dt><dd>${esc(e.purpose)}</dd>
<dt>States</dt><dd><div class="tw"><table><thead><tr><th>State</th><th>Produced by</th></tr></thead><tbody>
${e.states.map(s => `<tr><td><code>${esc(s.s)}</code></td><td>${esc(s.by)}</td></tr>`).join("")}
</tbody></table></div>${e.stateKind === "enum" ? '<p class="cap">These are answer kinds, not a lifecycle.</p>' : ""}</dd>
<dt>Events</dt><dd>${e.events.length ? e.events.map(x => `<code>${esc(x)}</code>`).join(" ") : "—"}</dd>
<dt>Relationships</dt><dd>${e.rel.map(esc).join(" · ")}</dd>
<dt>Invariants</dt><dd><ul>${e.inv.map(i => `<li>${esc(i)}</li>`).join("")}</ul></dd>
</dl></div>`).join("")}
</div>`;
  writeFileSync(join(HERE, "02-domain-model.html"), page("02-domain-model", "Domain Model", "", body));
}

/* ── 03 Service boundaries ────────────────────────────────────────────── */
{
  const body = `
<h1>Service Boundaries</h1>
<p class="lede">Ownership, interfaces, events in and out, dependencies, and — the
part that matters — what each service must never do. A forbidden list is the
only thing that stops a service growing into its neighbour.</p>

<div class="tw"><table><thead><tr><th>Service</th><th>Kind</th><th>Owns</th><th>Depends on</th></tr></thead><tbody>
${T.services.map(s => `<tr><td><code>${esc(s.id)}</code></td><td>${esc(s.kind)}</td>
<td>${T.entities.filter(e => e.svc === s.id).map(e => e.id).join(", ") || "—"}</td>
<td>${s.deps.length ? s.deps.join(", ") : "—"}</td></tr>`).join("")}
</tbody></table></div>

${T.services.map(s => `<section id="${esc(s.id)}"><h2>${esc(s.name)} <code>${esc(s.id)}</code></h2>
<p>${bp(s.bp)}</p>
<div class="card"><dl class="kv">
<dt>Responsibilities</dt><dd><ul>${s.resp.map(r => `<li>${esc(r)}</li>`).join("")}</ul></dd>
<dt>Public interfaces</dt><dd>${s.iface.length ? s.iface.map(i => `<code>${esc(i)}</code>`).join(" · ") : "—"}</dd>
<dt>Events consumed</dt><dd>${s.consumes.length ? s.consumes.map(x => `<code>${esc(x)}</code>`).join(" ") : "—"}</dd>
<dt>Events produced</dt><dd>${s.produces.length ? s.produces.map(x => `<code>${esc(x)}</code>`).join(" ") : "—"}</dd>
<dt>Dependencies</dt><dd>${s.deps.length ? s.deps.map(svc).join(" · ") : "none"}</dd>
<dt>Forbidden</dt><dd><ul class="forbid">${s.forbidden.map(r => `<li>${esc(r)}</li>`).join("")}</ul></dd>
</dl></div></section>`).join("")}`;
  writeFileSync(join(HERE, "03-service-boundaries.html"),
    page("03-service-boundaries", "Service Boundaries", toc(T.services.map(s => [s.id, s.name])), body));
}

/* ── 04 Event architecture ────────────────────────────────────────────── */
{
  const body = `
<h1>Event Architecture</h1>
<p class="lede">${T.events.length} events. Every one has a producer and at least
one consumer — an event with no consumer is a log line pretending to be an
event, and the validator fails it.</p>

<div class="rule"><b>Retry and idempotency</b>
Every event is <b>at-least-once</b> unless marked otherwise, so every consumer
must be idempotent on the stated key. Iraqi mobile networks make redelivery the
normal case, not the edge case — a duplicate dispense record or a duplicate
reservation would be a clinical defect, not an inconvenience.</div>

<div class="filters" data-target="evs">
  <button data-f="all" class="on">All</button>
  ${[...new Set(T.events.map(e => e.p))].map(p => `<button data-f="${esc(p)}">${esc(p.replace("-service", "").replace("-engine", ""))}</button>`).join("")}
  <input type="search" placeholder="Search events…" aria-label="Search events">
  <span class="cnt" style="font-size:.79rem;color:var(--ink3)"></span>
</div>
<div id="evs">
${T.events.map(e => `<div class="card" data-k="${esc(e.p)}" data-s="${esc([e.n, e.p, e.c.join(" "), e.trigger, e.side, e.payload].join(" ")).toLowerCase()}">
<header><b><code>${esc(e.n)}</code></b> ${bp(e.bp)}
${e.audit === "required" ? '<span class="pill ok">audited</span>' : ""}</header>
<dl class="kv">
<dt>Producer</dt><dd><code>${esc(e.p)}</code></dd>
<dt>Consumers</dt><dd>${e.c.map(x => `<code>${esc(x)}</code>`).join(" ")}</dd>
<dt>Trigger</dt><dd>${esc(e.trigger)}</dd>
<dt>Payload</dt><dd><code>${esc(e.payload)}</code></dd>
<dt>Side effects</dt><dd>${esc(e.side)}</dd>
<dt>Audit</dt><dd>${esc(e.audit)}</dd>
<dt>Retry</dt><dd>${esc(e.retry)}</dd>
<dt>Idempotency key</dt><dd><code>${esc(e.idem)}</code></dd>
</dl></div>`).join("")}
</div>`;
  writeFileSync(join(HERE, "04-event-architecture.html"), page("04-event-architecture", "Event Architecture", "", body));
}

/* ── 05 API contracts ─────────────────────────────────────────────────── */
{
  const body = `
<h1>API Contracts</h1>
<p class="lede">${T.endpoints.length} endpoints. Contracts only — no
implementation. Every endpoint names the service that owns it and the Blueprint
reference it serves; an endpoint with no reference fails the validator as an
invention.</p>

<div class="rule"><b>Three rules that apply to every endpoint</b>
<b>1.</b> Authority is checked in the owning service, never at the gateway —
a route-level check is bypassed the first time an internal caller is added.<br>
<b>2.</b> A missing relationship and a forbidden one return byte-identical
responses, so no lookup becomes an identity oracle.<br>
<b>3.</b> Every state-changing call carries an <code>Idempotency-Key</code>;
replaying it returns the original result, never a duplicate and never an error.</div>

<div class="filters" data-target="eps">
  <button data-f="all" class="on">All</button>
  ${[...new Set(T.endpoints.map(e => e.svc))].map(s => `<button data-f="${esc(s)}">${esc(s.replace("-service", "").replace("-engine", ""))}</button>`).join("")}
  <input type="search" placeholder="Search endpoints…" aria-label="Search endpoints">
  <span class="cnt" style="font-size:.79rem;color:var(--ink3)"></span>
</div>
<div id="eps">
${T.endpoints.map(e => `<div class="card" data-k="${esc(e.svc)}" data-s="${esc([e.m, e.p, e.svc, e.authz, e.req, e.res, (e.err || []).join(" ")].join(" ")).toLowerCase()}">
<header><b><code>${esc(e.m)} ${esc(e.p)}</code></b> ${bp(e.bp)}</header>
<dl class="kv">
<dt>Service</dt><dd><code>${esc(e.svc)}</code></dd>
<dt>Authentication</dt><dd>${esc(e.auth)}</dd>
<dt>Authorization</dt><dd>${esc(e.authz)}</dd>
<dt>Request</dt><dd><code>${esc(e.req)}</code></dd>
<dt>Response</dt><dd><code>${esc(e.res)}</code></dd>
<dt>Errors</dt><dd>${(e.err && e.err.length) ? `<ul>${e.err.map(x => `<li><code>${esc(x)}</code></li>`).join("")}</ul>` : "—"}</dd>
</dl></div>`).join("")}
</div>`;
  writeFileSync(join(HERE, "05-api-contracts.html"), page("05-api-contracts", "API Contracts", "", body));
}

/* ── 06 Database architecture ─────────────────────────────────────────── */
{
  const imm = T.tables.filter(t => t.imm === "YES");
  const body = `
<h1>Database Architecture</h1>
<p class="lede">Logical only. ${T.tables.length} tables, no SQL, no engine
choice. Every table maps to exactly one entity and one owning service; a table
with neither fails the validator as an orphan.</p>

<div class="rule"><b>Immutability is the load-bearing property</b>
<code>${imm.map(t => t.t).join("</code> and <code>")}</code> are append-only.
No principal in the system — including the operator — holds an update or delete
permission on them. A clinical record that can be edited is not a record, and an
audit log that can be modified is a formality.</div>

<h2>Tables</h2>
<div class="filters" data-target="tbs">
  <button data-f="all" class="on">All</button>
  ${[...new Set(T.tables.map(t => t.svc))].map(s => `<button data-f="${esc(s)}">${esc(s.replace("-service", "").replace("-engine", ""))}</button>`).join("")}
  <input type="search" placeholder="Search tables…" aria-label="Search tables">
  <span class="cnt" style="font-size:.79rem;color:var(--ink3)"></span>
</div>
<div id="tbs">
${T.tables.map(t => `<div class="card" data-k="${esc(t.svc)}" data-s="${esc([t.t, t.svc, t.cols, t.cons.join(" "), t.idx.join(" ")].join(" ")).toLowerCase()}">
<header><b><code>${esc(t.t)}</code></b> <code>${esc(t.svc)}</code> ${bp(t.bp)}
${t.imm === "YES" ? '<span class="pill ba">append-only</span>' : ""}</header>
<dl class="kv">
<dt>Columns</dt><dd><code>${esc(t.cols)}</code></dd>
<dt>Relationships</dt><dd>${esc(t.rel)}</dd>
<dt>Constraints</dt><dd><ul>${t.cons.map(c => `<li>${esc(c)}</li>`).join("")}</ul></dd>
<dt>Indexes</dt><dd>${t.idx.map(i => `<code>${esc(i)}</code>`).join(" · ")}</dd>
<dt>Deletion</dt><dd>${esc(t.del)}</dd>
<dt>Audit</dt><dd>${esc(t.audit)}</dd>
</dl></div>`).join("")}
</div>

<h2>Audit strategy</h2>
<ul>
<li><b>Every write</b> to a table marked <em>all writes</em> appends an audit entry with actor, target, action and time.</li>
<li><b>Every read of identified clinical data</b> appends an entry too — permitted reads included, because the point is that a patient can see who looked.</li>
<li><b>The audit stores a digest</b>, never the content. It records that a read happened, not what was read.</li>
<li><b>Under load the audit applies backpressure</b> rather than dropping entries. A dropped entry is a silent failure of the entire control.</li>
<li><b>On account deletion</b> the actor becomes a tombstone identifier and the entry survives, because accountability outlives the account.</li>
</ul>`;
  writeFileSync(join(HERE, "06-database-architecture.html"), page("06-database-architecture", "Database Architecture", "", body));
}

/* ── 07 Mobile navigation ─────────────────────────────────────────────── */
{
  const n = T.navigation;
  const body = `
<h1>Mobile Navigation</h1>
<p class="lede">React Native navigation architecture. No UI design. Every route
derives from a Blueprint v3 screen id.</p>

<div class="rule"><b>Role isolation is structural</b>
${esc(n.principle)}</div>

${n.apps.map(a => `<section id="${esc(a.app.toLowerCase())}"><h2>${esc(a.app)}</h2>
<p><b>Root:</b> <code>${esc(a.root)}</code> · <b>Navigator states:</b> ${a.states.map(s => `<code>${esc(s)}</code>`).join(" ")}</p>
${a.tabs.length && a.tabs[0].tab !== "—" ? `<pre class="mermaid">graph TB
  R["${a.root}"] --> ${a.states.map((s, i) => `S${i}["${s}"]`).join(" & ")}
${a.tabs.map((t, i) => `  S${a.states.length - 1} --> T${i}["${t.tab}<br/>${t.stack}"]`).join("\n")}
${a.modals.map((m, i) => `  S${a.states.length - 1} -.modal.-> M${i}["${m.split(" (")[0]}"]`).join("\n")}</pre>` : ""}
<h3>Tabs</h3>
<div class="tw"><table><thead><tr><th>Tab</th><th>Stack</th><th>Screens</th><th>Ref</th></tr></thead><tbody>
${a.tabs.map(t => `<tr><td>${esc(t.tab)}</td><td><code>${esc(t.stack)}</code></td><td>${esc(t.screens)}</td><td>${bp(t.bp)}</td></tr>`).join("")}
</tbody></table></div>
${a.modals.length ? `<h3>Modals</h3><ul>${a.modals.map(m => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
<h3>Route guards</h3>
<div class="tw"><table><thead><tr><th>Guard</th><th>Applies to</th><th>Behaviour</th><th>Ref</th></tr></thead><tbody>
${a.guards.map(g => `<tr><td><code>${esc(g.g)}</code></td><td>${esc(g.applies)}</td><td>${esc(g.behaviour)}</td><td>${bp(g.bp)}</td></tr>`).join("")}
</tbody></table></div>
${a.deep.length ? `<h3>Deep links</h3><div class="tw"><table><thead><tr><th>URL</th><th>Target</th><th>Stack</th><th>Ref</th></tr></thead><tbody>
${a.deep.map(d => `<tr><td><code>${esc(d.url)}</code></td><td>${esc(d.target)}</td><td>${esc(d.stack || "—")}</td><td>${bp(d.bp)}</td></tr>`).join("")}
</tbody></table></div>` : ""}
</section>`).join("")}

<section id="rules"><h2>Rules that apply to every navigator</h2>
<ol>${n.rules.map(r => `<li>${esc(r)}</li>`).join("")}</ol></section>`;
  writeFileSync(join(HERE, "07-mobile-navigation.html"),
    page("07-mobile-navigation", "Mobile Navigation",
      toc([...n.apps.map(a => [a.app.toLowerCase(), a.app]), ["rules", "Rules"]]), body));
}

/* ── 08 Security architecture ─────────────────────────────────────────── */
{
  const S = T.security;
  const sect = (id, title, rows, lede) => `<section id="${id}"><h2>${title}</h2>
${lede ? `<p>${lede}</p>` : ""}
<div class="tw"><table><thead><tr><th style="width:180px">Aspect</th><th>Decision</th><th>Ref</th></tr></thead><tbody>
${rows.map(r => `<tr><td><b>${esc(r.k)}</b></td><td>${esc(r.v)}</td><td>${r.bp ? bp(r.bp) : "—"}</td></tr>`).join("")}
</tbody></table></div></section>`;
  const body = `
<h1>Security Architecture</h1>
<p class="lede">Derived from Blueprint v3 §5 and §9. Nothing here relaxes a
product rule and nothing here adds one.</p>

<div class="rule"><b>Four enforcement rules</b>
<b>1.</b> Hidden UI is not a permission — the client enforces nothing.<br>
<b>2.</b> Authority is checked where the work happens, not at the entry point.<br>
<b>3.</b> A missing relationship is indistinguishable from a forbidden one.<br>
<b>4.</b> Least privilege wins on ambiguity — the narrowest applicable grant,
never the first found.</div>

${sect("authn", "Authentication", S.authn)}
${sect("authz", "Authorization", S.authz)}
${sect("session", "Session and token lifecycle", S.session)}
${sect("device", "Device trust", S.device)}
${sect("crypto", "Encryption", S.crypto)}
${sect("privacy", "Privacy boundaries", S.privacy, "These are product promises from Blueprint v3, expressed as technical boundaries. Each is enforced by construction rather than by policy where that is possible — the branch inbox projection does not <em>contain</em> patient identity, so it cannot leak it.")}
${sect("audit", "Audit logging", S.audit)}`;
  writeFileSync(join(HERE, "08-security-architecture.html"),
    page("08-security-architecture", "Security Architecture",
      toc([["authn", "Authentication"], ["authz", "Authorization"], ["session", "Sessions"], ["device", "Device trust"], ["crypto", "Encryption"], ["privacy", "Privacy"], ["audit", "Audit"]]), body));
}

/* ── 09 Testing strategy ──────────────────────────────────────────────── */
{
  const levels = [...new Set(T.tests.map(t => t.lvl))];
  const body = `
<h1>Testing Strategy</h1>
<p class="lede">${T.tests.length} test areas across ${levels.length} levels.
<b>Every test traces to a Blueprint v3 reference</b> — a test with no reference
is testing an invention, and the validator fails it.</p>

<div class="kpi">
${levels.map(l => `<div><span>${esc(l)}</span><strong>${T.tests.filter(t => t.lvl === l).length}</strong></div>`).join("")}
</div>

<div class="rule"><b>The two suites that carry the most weight</b>
<b>Permission tests</b> exercise every cell of the Blueprint's matrices,
positive and negative — including the row v1 got wrong, where an assistant
confirming a reservation must <em>succeed</em>. <b>State-machine tests</b>
assert that no transition outside the diagram is reachable, which is the only
way a state machine in a document stays true of the code.</div>

<div class="filters" data-target="tests">
  <button data-f="all" class="on">All</button>
  ${levels.map(l => `<button data-f="${esc(l)}">${esc(l)}</button>`).join("")}
  <input type="search" placeholder="Search tests…" aria-label="Search tests">
  <span class="cnt" style="font-size:.79rem;color:var(--ink3)"></span>
</div>
<div id="tests">
${T.tests.map(t => `<div class="card" data-k="${esc(t.lvl)}" data-s="${esc([t.lvl, t.area, t.assert, t.bp].join(" ")).toLowerCase()}">
<header><b>${esc(t.area)}</b> <span class="pill ok">${esc(t.lvl)}</span> ${bp(t.bp)}</header>
<p style="margin:.2rem 0 0">${esc(t.assert)}</p></div>`).join("")}
</div>`;
  writeFileSync(join(HERE, "09-testing-strategy.html"), page("09-testing-strategy", "Testing Strategy", "", body));
}

/* ── 10 Release architecture ──────────────────────────────────────────── */
{
  const R = T.release;
  const body = `
<h1>Release Architecture</h1>
<p class="lede">The release process is not new. It already exists in this
repository and is reused: <code>release-manifest.yaml</code> is the sole
operational source of truth, with ten validators and a generator that can prove
no output was hand-edited.</p>

<div class="rule"><b>Single source of truth</b>${esc(R.ssot)}</div>

<section id="pipeline"><h2>Pipeline</h2>
<div class="tw"><table><thead><tr><th>Stage</th><th>Does</th><th>Gate</th></tr></thead><tbody>
${R.pipeline.map(s => `<tr><td><b>${esc(s.stage)}</b></td><td>${esc(s.does)}</td><td>${esc(s.gate)}</td></tr>`).join("")}
</tbody></table></div>
<pre class="mermaid">flowchart LR
${R.pipeline.map((s, i) => `  S${i}["${s.stage}"]`).join("\n")}
${R.pipeline.slice(1).map((s, i) => `  S${i} --> S${i + 1}`).join("\n")}
  S9 --> REL["status: released"]</pre>
<p class="cap">Stage 7 is the one most projects omit: known-bad manifests must be
<em>rejected</em>. A release gate that has never failed is untested.</p>
</section>

<section id="artifacts"><h2>Artifacts</h2>
<div class="tw"><table><thead><tr><th>Artifact</th><th>Produced by</th><th>Note</th></tr></thead><tbody>
${R.artifacts.map(a => `<tr><td><code>${esc(a.a)}</code></td><td>${esc(a.from)}</td><td>${esc(a.note)}</td></tr>`).join("")}
</tbody></table></div></section>

<section id="gates"><h2>Validation gates for <code>status: released</code></h2>
<ol>${R.gates.map(g => `<li>${esc(g)}</li>`).join("")}</ol></section>

<section id="rollback"><h2>Rollback</h2>
<div class="tw"><table><thead><tr><th style="width:180px">Layer</th><th>Strategy</th></tr></thead><tbody>
${R.rollback.map(r => `<tr><td><b>${esc(r.k)}</b></td><td>${esc(r.v)}</td></tr>`).join("")}
</tbody></table></div>
<div class="rule"><b>What a rollback can never do</b>
Erase a dispense record or an audit entry. Those tables are append-only in both
directions of time — a rollback that could remove a clinical record is not a
rollback, it is data loss with a friendly name. Corrections are new records.</div>
</section>`;
  writeFileSync(join(HERE, "10-release-architecture.html"),
    page("10-release-architecture", "Release Architecture",
      toc([["pipeline", "Pipeline"], ["artifacts", "Artifacts"], ["gates", "Gates"], ["rollback", "Rollback"]]), body));
}

/* ── 11 Validation report ─────────────────────────────────────────────── */
{
  const sevPill = (s) => s === "blocker" ? "ba" : s === "major" ? "wa" : "ok";
  const body = `
<h1>Architecture Validation Report</h1>
<p class="lede">Computed from <code>model.js</code> by
<code>validate.mjs</code>. Every check reads data; none asserts a conclusion in
prose, because a validation report that cannot fail is a certificate rather than
a check.</p>

<div class="kpi">
<div><span>Checks passing</span><strong>${V.checks.filter(c => c.pass).length}/${V.checks.length}</strong></div>
<div><span>Services</span><strong>${V.counts.services}</strong></div>
<div><span>Entities</span><strong>${V.counts.entities}</strong></div>
<div><span>Events</span><strong>${V.counts.events}</strong></div>
<div><span>Endpoints</span><strong>${V.counts.endpoints}</strong></div>
<div><span>Tables</span><strong>${V.counts.tables}</strong></div>
<div><span>Tests</span><strong>${V.counts.tests}</strong></div>
<div><span>Blueprint gaps</span><strong>${V.counts.gaps}</strong></div>
</div>

<section id="checks"><h2>The ten required checks, plus one</h2>
<div class="tw"><table><thead><tr><th style="width:60px">#</th><th>Check</th><th style="width:90px">Result</th><th>Findings</th></tr></thead><tbody>
${V.checks.map(c => `<tr><td><code>${esc(c.id)}</code></td><td>${esc(c.name)}</td>
<td><span class="pill ${c.pass ? "ok" : "ba"}">${c.pass ? "PASS" : "FAIL"}</span></td>
<td>${c.failures.length ? `<ul>${c.failures.map(f => `<li>${esc(f)}</li>`).join("")}</ul>` : "—"}</td></tr>`).join("")}
</tbody></table></div>
${V.pass ? `<div class="rule"><b>Result</b>All checks pass. Three of them failed on the
first run and were fixed rather than weakened: a genuine circular dependency
between the identity and notification services, an entity whose answer enum was
modelled as a lifecycle, and every entity state matched by string search rather
than by a declared implementation path. The last of those is why each state now
names the endpoint, event or scheduler that produces it.</div>` : ""}
</section>

<section id="gaps"><h2>Blueprint gaps — ${T.gaps.length}</h2>
<p class="lede">The instruction was: if implementation requires a product
decision Blueprint v3 does not contain, <b>stop and document the gap instead of
inventing a solution</b>. These are those gaps. Nothing below was invented.</p>

<div class="rule"><b>These are not validation failures</b>
They are decisions the Blueprint does not contain. The technical architecture is
internally consistent without them; several screens simply cannot be built until
they are answered. Each gap names what it blocks.</div>

<div class="filters" data-target="gaps">
  <button data-f="all" class="on">All</button>
  <button data-f="blocker">Blocker</button>
  <button data-f="major">Major</button>
  <button data-f="minor">Minor</button>
  <input type="search" placeholder="Search gaps…" aria-label="Search gaps">
  <span class="cnt" style="font-size:.79rem;color:var(--ink3)"></span>
</div>
<div id="gaps">
${T.gaps.map(g => `<div class="card" data-k="${esc(g.sev)}" data-s="${esc([g.id, g.area, g.gap, g.need, g.doing].join(" ")).toLowerCase()}">
<header><b>${esc(g.id)} · ${esc(g.area)}</b> <span class="pill ${sevPill(g.sev)}">${esc(g.sev)}</span> ${bp(g.bp)}</header>
<dl class="kv">
<dt>The gap</dt><dd>${esc(g.gap)}</dd>
<dt>What is needed</dt><dd>${esc(g.need)}</dd>
<dt>What we are doing</dt><dd>${esc(g.doing)}</dd>
</dl></div>`).join("")}
</div></section>

<section id="ready"><h2>Is the team ready to build?</h2>
<p><b>Yes for the core loop; no for ${T.gaps.filter(g => g.sev === "blocker").length} screens.</b>
Everything in Blueprint v3's request → offer → reservation → collection path is
fully specified here: entities, states with their producing paths, events with
producers and consumers, endpoints with authorisation, tables with constraints,
and tests that trace back to the Blueprint.</p>
<p>The blocked screens are
${T.gaps.filter(g => g.sev === "blocker").map(g => `<b>${esc(g.id)}</b>`).join(", ")} —
saved pharmacies, price disputes, support tickets and the consented support
session. Each needs a product decision, and each is a decision an engineer would
otherwise make by accident, which is exactly what this exercise exists to
prevent.</p>
</section>`;
  writeFileSync(join(HERE, "11-validation-report.html"),
    page("11-validation-report", "Validation Report",
      toc([["checks", "Checks"], ["gaps", "Blueprint gaps"], ["ready", "Ready to build?"]]), body));
}

/* ── index ────────────────────────────────────────────────────────────── */
{
  const body = `
<h1>Dawai — Technical Architecture</h1>
<p class="lede">Derived entirely from <a href="../product/v3/blueprint-v3.html">Blueprint
v3</a>, which is frozen. No new screens, flows, permissions, business rules or
entities. Where the Blueprint does not answer something the implementation
needs, it is recorded as a gap rather than invented.</p>

<div class="kpi">
<div><span>Checks passing</span><strong>${V.checks.filter(c => c.pass).length}/${V.checks.length}</strong></div>
<div><span>Services</span><strong>${V.counts.services}</strong></div>
<div><span>Entities</span><strong>${V.counts.entities}</strong></div>
<div><span>Events</span><strong>${V.counts.events}</strong></div>
<div><span>Endpoints</span><strong>${V.counts.endpoints}</strong></div>
<div><span>Tables</span><strong>${V.counts.tables}</strong></div>
<div><span>Tests</span><strong>${V.counts.tests}</strong></div>
<div><span>Gaps</span><strong>${V.counts.gaps}</strong></div>
</div>

<div class="tw"><table><thead><tr><th>Document</th><th>Answers</th></tr></thead><tbody>
${[["01-system-architecture", "What are the components and how do they connect?"],
   ["02-domain-model", "What are the entities, their states, and what produces each state?"],
   ["03-service-boundaries", "Who owns what — and what must each service never do?"],
   ["04-event-architecture", "Every event: producer, consumers, payload, retry, idempotency"],
   ["05-api-contracts", "Every endpoint, with authentication and authorisation"],
   ["06-database-architecture", "Logical tables, constraints, indexes, immutability, audit"],
   ["07-mobile-navigation", "Stacks, tabs, guards, deep links, role isolation"],
   ["08-security-architecture", "Authentication, sessions, encryption, privacy boundaries"],
   ["09-testing-strategy", "Every test, traced to a Blueprint reference"],
   ["10-release-architecture", "Pipeline, gates, artifacts, rollback"],
   ["11-validation-report", "The ten required checks, computed — and the gaps found"]]
  .map(([s, d]) => `<tr><td><a href="${s}.html"><b>${esc(s)}</b></a></td><td>${esc(d)}</td></tr>`).join("")}
</tbody></table></div>

<div class="rule"><b>How to change this</b>
Edit <code>docs/technical/model.js</code>, then run
<code>node docs/technical/validate.mjs &amp;&amp; node docs/technical/build.mjs</code>.
These HTML files are generated outputs — editing one directly creates a second
source of truth, which is the failure this whole structure exists to prevent.</div>`;
  writeFileSync(join(HERE, "index.html"), page("", "Overview", "", body));
}

console.log(`Generated ${DOCS.length + 1} documents in docs/technical/`);
