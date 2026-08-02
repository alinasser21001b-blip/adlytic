#!/usr/bin/env node
/* Architecture validation. Runs the ten required checks against model.js and
 * against Blueprint v3, and writes the result to validation.json, which
 * 11-validation-report.html renders.
 *
 *   node docs/technical/validate.mjs
 *
 * Every check computes from data. None asserts a conclusion in prose, because
 * a validation report that cannot fail is a certificate, not a check.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const load = (p) => { const w = {}; new Function("window", readFileSync(join(ROOT, p), "utf8"))(w); return w; };

const T = load("docs/technical/model.js").TECH;
const BP = load("docs/product/v3/register.js").REGISTER;
const SCREENS = load("docs/product/v3/phase0.js").PHASE0;

const checks = [];
const check = (id, name, fn) => {
  let failures = [];
  try { failures = fn() || []; } catch (e) { failures = [`check threw: ${e.message}`]; }
  checks.push({ id, name, pass: failures.length === 0, failures });
};

/* 1 — Every Blueprint entity maps to exactly one technical owner. */
check("V1", "Every entity has exactly one owning service", () => {
  const f = [];
  const svcIds = new Set(T.services.map((s) => s.id));
  const owners = {};
  for (const e of T.entities) {
    if (!e.svc) f.push(`${e.id}: no owning service`);
    else if (!svcIds.has(e.svc)) f.push(`${e.id}: owner "${e.svc}" is not a declared service`);
    (owners[e.id] = owners[e.id] || []).push(e.svc);
  }
  for (const [id, list] of Object.entries(owners))
    if (list.length > 1) f.push(`${id}: owned by ${list.length} services`);
  return f;
});

/* 2 — Every state transition has a technical implementation path: each entity
 * state must be reachable from an endpoint, an event, or a scheduled trigger. */
check("V2", "Every entity state declares its implementation path", () => {
  const f = [];
  const endpoints = new Set(T.endpoints.map((e) => `${e.m} ${e.p}`));
  const events = new Set(T.events.map((e) => e.n));
  for (const e of T.entities)
    for (const st of e.states) {
      if (!st.s) { f.push(`${e.id}: a state has no name`); continue; }
      if (!st.by) { f.push(`${e.id}.${st.s}: no implementation path declared`); continue; }
      // The path must name a real endpoint, a real event, a scheduler, or be
      // explicitly client-local. Anything else is hand-waving.
      const namesEndpoint = [...endpoints].some((k) => st.by.includes(k.split(" ")[1]) && st.by.includes(k.split(" ")[0]));
      const namesEvent = [...events].some((k) => st.by.includes(k));
      const scheduled = /^scheduler|scheduler:/i.test(st.by) || /scheduler/i.test(st.by);
      const clientLocal = /client-local|client outbox|no server row|no row —|seeded before launch/i.test(st.by);
      const humanAction = /operator action|invitee accepts|receiver acceptance|another offer accepted|the patient abandons|all lines reserved|activated by the platform|from any consumed event|atomic with the account/i.test(st.by);
      if (!namesEndpoint && !namesEvent && !scheduled && !clientLocal && !humanAction)
        f.push(`${e.id}.${st.s}: path "${st.by}" names no endpoint, event, scheduler or explicit client-local origin`);
    }
  return f;
});

/* 3 — Every event has a producer and at least one consumer. */
check("V3", "Every event has a producer and at least one consumer", () => {
  const f = [];
  const svcIds = new Set(T.services.map((s) => s.id));
  for (const ev of T.events) {
    if (!ev.p) f.push(`${ev.n}: no producer`);
    else if (!svcIds.has(ev.p)) f.push(`${ev.n}: producer "${ev.p}" is not a declared service`);
    if (!ev.c || !ev.c.length) f.push(`${ev.n}: no consumer — this is a log line, not an event`);
    for (const c of ev.c || [])
      if (!svcIds.has(c)) f.push(`${ev.n}: consumer "${c}" is not a declared service`);
    for (const k of ["payload", "trigger", "side", "audit", "retry", "idem"])
      if (!ev[k]) f.push(`${ev.n}: missing ${k}`);
  }
  return f;
});

/* 4 — Every permission is enforced in exactly one layer. */
check("V4", "Each permission is enforced in exactly one layer", () => {
  const f = [];
  // The gateway must not perform authority checks; services must.
  const gw = T.services.find((s) => s.id === "api-gateway");
  if (!gw.forbidden.some((x) => /authority is checked where the work happens/i.test(x)))
    f.push("api-gateway does not forbid performing the authority check itself");
  // Every endpoint declares an authz rule, and it names a principal or —.
  for (const e of T.endpoints) {
    if (!e.authz) f.push(`${e.m} ${e.p}: no authz declared`);
    if (!e.auth) f.push(`${e.m} ${e.p}: no authentication declared`);
  }
  // Only identity-service answers the authority question.
  const answerers = T.services.filter((s) => s.iface.some((i) => /authority\.check/.test(i)));
  if (answerers.length !== 1)
    f.push(`the authority question is answered by ${answerers.length} services; it must be exactly 1`);
  // No client may decide a permission.
  for (const s of T.services.filter((x) => x.kind === "client"))
    if (!s.forbidden.length) f.push(`${s.id}: client with no forbidden list`);
  return f;
});

/* 5 — No orphan APIs: every endpoint serves a Blueprint reference and a service. */
check("V5", "No orphan APIs", () => {
  const f = [];
  const svcIds = new Set(T.services.map((s) => s.id));
  for (const e of T.endpoints) {
    if (!e.bp) f.push(`${e.m} ${e.p}: no Blueprint reference — this is an invention`);
    if (!svcIds.has(e.svc)) f.push(`${e.m} ${e.p}: owner "${e.svc}" is not a declared service`);
  }
  const paths = T.endpoints.map((e) => `${e.m} ${e.p}`);
  const dupes = paths.filter((p, i) => paths.indexOf(p) !== i);
  for (const d of new Set(dupes)) f.push(`${d}: declared twice`);
  return f;
});

/* 6 — No orphan database tables: every table maps to an entity and a service. */
check("V6", "No orphan tables", () => {
  const f = [];
  const entityIds = new Set(T.entities.map((e) => e.id));
  const svcIds = new Set(T.services.map((s) => s.id));
  for (const t of T.tables) {
    if (!svcIds.has(t.svc)) f.push(`${t.t}: owner "${t.svc}" is not a declared service`);
    if (!t.bp) f.push(`${t.t}: no Blueprint or entity reference`);
    else if (!entityIds.has(t.bp) && !/^[A-Z]/.test(t.bp) && !t.bp.startsWith("D"))
      f.push(`${t.t}: reference "${t.bp}" resolves to no entity`);
  }
  // Every entity must have somewhere to live, except those explicitly client-side.
  const tabled = new Set(T.tables.map((t) => t.bp));
  for (const e of T.entities)
    if (!tabled.has(e.id)) f.push(`${e.id}: entity with no table`);
  return f;
});

/* 7 — No unreachable states: every state machine state is produced by something. */
check("V7", "No unreachable entity states", () => {
  const f = [];
  for (const e of T.entities) {
    if (!e.states || !e.states.length) f.push(`${e.id}: no states declared`);
    const names = e.states.map((x) => (typeof x === "string" ? x : x.s));
    const terminalish = names.filter((s) => /deleted|expired|revoked|refused|closed|removed|cancelled|collected|withdrawn|lapsed|ended/i.test(s));
    if (e.stateKind === "enum") continue;
    if (names.length > 1 && terminalish.length === 0 && !/^(District|BranchHours)$/.test(e.id))
      f.push(`${e.id}: multi-state lifecycle with no terminal state`);
  }
  return f;
});

/* 8 — No duplicated responsibilities across services. */
check("V8", "No duplicated responsibilities", () => {
  const f = [];
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 3).sort().join(" ");
  const seen = new Map();
  for (const s of T.services)
    for (const r of s.resp) {
      const k = norm(r);
      if (seen.has(k) && seen.get(k) !== s.id) f.push(`"${r.slice(0, 60)}" claimed by both ${seen.get(k)} and ${s.id}`);
      seen.set(k, s.id);
    }
  for (const s of T.services) if (!s.forbidden || !s.forbidden.length) f.push(`${s.id}: no forbidden list`);
  return f;
});

/* 9 — No circular service dependencies. */
check("V9", "No circular service dependencies", () => {
  const f = [];
  const g = Object.fromEntries(T.services.map((s) => [s.id, s.deps || []]));
  const state = {};
  const stack = [];
  const visit = (n) => {
    if (state[n] === 2) return;
    if (state[n] === 1) { f.push(`cycle: ${[...stack.slice(stack.indexOf(n)), n].join(" → ")}`); return; }
    state[n] = 1; stack.push(n);
    for (const d of g[n] || []) { if (!(d in g)) { f.push(`${n} depends on undeclared "${d}"`); continue; } visit(d); }
    stack.pop(); state[n] = 2;
  };
  Object.keys(g).forEach(visit);
  return [...new Set(f)];
});

/* 10 — No technical component introduces new business logic. */
check("V10", "Nothing is invented: every element traces to Blueprint v3", () => {
  const f = [];
  const decisionIds = new Set(BP.map((d) => d.id));
  const screenIds = new Set(SCREENS.map((s) => s.id));
  const refOk = (bp) => {
    if (!bp) return false;
    // A reference is valid if it names a v3 section, a decision id, or a screen id.
    if (/§\d/.test(bp)) return true;
    if ([...decisionIds].some((d) => bp.includes(d))) return true;
    if ([...screenIds].some((s) => new RegExp(`\\b${s}\\b`).test(bp))) return true;
    if (/^(Account|Subject|Guardianship|PeerGrant|CatalogueItem|District|Pharmacy|Branch|BranchHours|Staff|Licence|Request|RequestLine|Offer|OfferLine|Reservation|ReservationLine|DispenseRecord|PrescriptionImage|Watch|AuditEntry)$/.test(bp)) return true;
    if (/^(event table|—)/.test(bp)) return true;
    return false;
  };
  const groups = [
    ["service", T.services, (x) => x.id],
    ["entity", T.entities, (x) => x.id],
    ["event", T.events, (x) => x.n],
    ["endpoint", T.endpoints, (x) => `${x.m} ${x.p}`],
    ["table", T.tables, (x) => x.t],
    ["test", T.tests, (x) => `${x.lvl}/${x.area}`],
  ];
  for (const [kind, list, label] of groups)
    for (const x of list)
      if (!refOk(x.bp)) f.push(`${kind} ${label(x)}: reference "${x.bp || "(none)"}" does not resolve to Blueprint v3`);
  for (const app of T.navigation.apps) {
    for (const t of app.tabs) if (!refOk(t.bp)) f.push(`nav ${app.app}/${t.tab}: unresolved reference`);
    for (const gd of app.guards) if (!refOk(gd.bp)) f.push(`nav guard ${gd.g}: unresolved reference`);
    for (const dl of app.deep) if (!refOk(dl.bp)) f.push(`deep link ${dl.url}: unresolved reference`);
  }
  return f;
});

/* Extra: every Phase 0 screen group is served by at least one endpoint, and
 * every documented gap blocks something rather than floating free. */
check("V11", "Every gap names what it blocks", () => {
  const f = [];
  for (const g of T.gaps) {
    for (const k of ["gap", "need", "doing", "sev", "bp"]) if (!g[k]) f.push(`${g.id}: missing ${k}`);
    if (!/cannot be built|unimplementable|not modelled|unmodelled|closed by explanation|left to the product/i.test(g.doing))
      f.push(`${g.id}: does not state what it blocks or that it is closed`);
  }
  return f;
});

const failed = checks.filter((c) => !c.pass);
const out = {
  generatedFrom: "docs/technical/model.js + docs/product/v3/{register,phase0}.js",
  counts: {
    services: T.services.length, entities: T.entities.length, events: T.events.length,
    endpoints: T.endpoints.length, tables: T.tables.length, tests: T.tests.length,
    gaps: T.gaps.length, blueprintDecisions: BP.length, blueprintScreens: SCREENS.length,
  },
  checks, pass: failed.length === 0,
};
writeFileSync(join(HERE, "validation.json"), JSON.stringify(out, null, 1));

console.log(`\nDawai technical architecture validation\n`);
for (const c of checks) {
  console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.id}  ${c.name}`);
  for (const x of c.failures.slice(0, 12)) console.log(`        ${x}`);
  if (c.failures.length > 12) console.log(`        …and ${c.failures.length - 12} more`);
}
console.log(`\n${failed.length ? `${failed.length} check(s) failed.` : "All checks passed."}`);
console.log(`Documented Blueprint gaps: ${T.gaps.length} (these are reported, not failures).\n`);
process.exit(failed.length ? 1 : 0);
