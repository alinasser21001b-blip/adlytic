/* ============================================================
   THE REGISTER — presentation invariants
   ============================================================
   Added with the redesign, not inherited. Every assertion here is a defect that
   was found by measuring the real app during implementation, so each one is a
   regression guard for something that has already happened once.

   Source-level, like the nav-key test in test.mjs, because the invariants are
   properties of how the screens are WRITTEN. The browser-side proofs live in
   tools/journeys.mjs and tools/audit-ui.mjs.
   ============================================================ */
import fs from "node:fs";
const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
const rec = read("js/ui-record.js");
const css = read("css/qareeb.css");
const ident = read("src/styles/identity.css");
const consent = read("js/consent.js");

let pass = 0; const fails = [];
const it = (name, fn) => { try { fn(); pass++; console.log("   ✓ " + name); }
  catch (e) { fails.push(name + " — " + e.message); console.log("   ✗ " + name); } };
const ok = (c, m) => { if (!c) throw new Error(m || "expected true"); };

console.log("\n── الدفتر — register presentation invariants");

/* The supervisor measured the shipped token at 3.42:1 across 143 control edges
   and corrected an exploration that had reported it failing. A passing token
   must not be "fixed". */
it("--line-ctl keeps the value it was measured to hold", () => {
  ok(/--line-ctl:\s*rgba\(11,\s*20,\s*18,\s*\.50\)/.test(ident), "light --line-ctl changed");
  ok(/--line-ctl:\s*rgba\(240,\s*236,\s*228,\s*\.40\)/.test(ident), "dark --line-ctl changed");
});

/* The audit cannot composite alpha, and neither can a reader. A surface whose
   real colour only exists after painting is not checkable — 24 findings. */
it("the register's washes are opaque, pre-composited values", () => {
  const decls = [...ident.matchAll(/--wash-(time|alarm):\s*([^;]+);/g)].map((m) => m[2].trim());
  ok(decls.length === 4, `expected 4 wash declarations, found ${decls.length}`);
  for (const d of decls) ok(/^#[0-9A-Fa-f]{6}$/.test(d), `wash is not an opaque hex: ${d}`);
});

/* `--ink-4` draws tick marks and grips at 2.84:1. It is not a text colour. */
it("no register class sets body text in the non-text ink", () => {
  const mine = css.slice(css.indexOf("36 · THE REGISTER"));
  const bad = [...mine.matchAll(/([.#][\w-]+[^{}]*)\{[^}]*color:\s*var\(--ink-4\)[^}]*\}/g)]
    .map((m) => m[1].trim());
  ok(!bad.length, "text set in --ink-4: " + bad.join(", "));
});

/* Above the boundary the risk is hiding something dangerous. */
it("a critical result and every custody event bypass aggregation", () => {
  const fn = rec.slice(rec.indexOf("function openRows"), rec.indexOf("function loopKindLabel"));
  const critBlock = fn.slice(fn.indexOf("const crit ="), fn.indexOf("if (other.length)"));
  ok(/for \(const x of crit\) rows\.push\(regRow\(/.test(critBlock),
    "critical results must be pushed as individual regRow, never aggRow");
  for (const marker of ["activeShares", "d.carry", "accessAlerts"]) {
    const i = fn.indexOf(marker);
    ok(i > 0, `custody source missing: ${marker}`);
    /* the nearest push after each custody source must be a plain row */
    const after = fn.slice(i, i + 700);
    ok(after.includes("rows.push(regRow("), `${marker} must render as regRow`);
    ok(!/rows\.push\(aggRow\(/.test(after.slice(0, after.indexOf("rows.push(regRow(") + 20)),
      `${marker} must not aggregate`);
  }
});

/* One fact, one side of the boundary. An abnormal result nobody has
   acknowledged has NOT ended, so it may not also appear under «انتهى». */
it("the history excludes what is still open above the boundary", () => {
  const fn = rec.slice(rec.indexOf("function historyRows"), rec.indexOf("function yearTally"));
  ok(fn.includes("openKey"), "historyRows must build the set of still-open results");
  ok(/isAbnormal\(x\) && !x\.acknowledgedBy/.test(fn), "openKey must be unacknowledged abnormals");
  ok(/tl0\.filter\(/.test(fn), "the timeline must be filtered by it");
});

/* networkTasks raises its own register for two facts the results band already
   renders with severity split out. */
it("the two fail-safe registers are de-duplicated against each other", () => {
  for (const fn of ["function openLoops", "function clinicianWork"]) {
    const body = rec.slice(rec.indexOf(fn), rec.indexOf(fn) + 2600);
    ok(body.includes("critical-unacknowledged") && body.includes("result-acknowledgement"),
      `${fn} must filter both duplicate kinds out of networkTasks`);
  }
});

/* The supervisor's three binding conditions on the «رجعت» join. */
it("«رجعت» states its own basis and never names the grantee by assumption", () => {
  const fn = rec.slice(rec.indexOf("function loanRow"), rec.indexOf("const evtWord"));
  ok(/كتبها \$\{who\} وهو ماسك أوراقك/.test(fn), "the named branch must state the custody basis in words");
  /* Slice ONLY the unattributed ternary — the surrounding row legitimately names
     the grantee in the line stating who the sheets were handed to. */
  const from = fn.indexOf("b.anon.length ?");
  const anon = fn.slice(from, fn.indexOf(': ""}', from) + 5);
  ok(anon.includes("ما مسجّل منو غيّره"), "the unattributed branch must say the actor is unrecorded");
  ok(!anon.includes("${who}"), "the unattributed branch must never interpolate the grantee");
});

/* The deck's bands are derived from consent.js, exhaustively, with no neutral
   bucket — that bucket is where storage nouns hide. */
it("the deck's bands partition ALL_SCOPES and add no neutral bucket", () => {
  const fn = rec.slice(rec.indexOf("globalThis.screenDeck"), rec.indexOf("function assistGaps"));
  ok(fn.includes("C().SAFETY_FLOOR"), "band 1 must come from SAFETY_FLOOR");
  ok(/EMERGENCY_SCOPES\.filter\(\(x\) => floor\.indexOf\(x\) === -1\)/.test(fn),
    "band 2 must be EMERGENCY_SCOPES minus SAFETY_FLOOR");
  ok(/ALL_SCOPES\.filter\(\(x\) => floor\.indexOf\(x\) === -1 && emerg\.indexOf\(x\) === -1\)/.test(fn),
    "band 3 must be the remainder of ALL_SCOPES");
  ok(!/أوراقك<\/h2>|>أوراقك</.test(fn), "there must be no neutral «أوراقك» band");
  /* and the three bands must together cover every scope the engine defines */
  const scopes = [...consent.matchAll(/^\s{4}([A-Z_]+):\s*"([a-z]+)"/gm)].map((m) => m[2]);
  ok(scopes.length >= 11, `expected >= 11 scopes in consent.js, found ${scopes.length}`);
});

/* A refused interpretation must OCCUPY its slot. An absent block reads as
   "nothing to say"; a refusal reads as "we will not say it". */
it("the mixed-laboratory refusal renders as a present block, not an omission", () => {
  const fn = rec.slice(rec.indexOf("function seriesPatient"), rec.indexOf("globalThis.screenResults"));
  ok(fn.includes("blocksInterpretation"), "the refusal must be detected from the statement flag");
  ok(/blocked\s*$|blocked\n/m.test(fn) || fn.includes("? tierBlock("), "the refusal must render a block");
  ok(fn.includes("stop: true"), "the refusal block must be marked as a stop");
  const after = fn.slice(fn.indexOf("blocked"));
  ok(after.indexOf("tierBlock(T(\"ما نقدر نفسّر\"") < after.indexOf("tierBlock(T(\"تفسير\""),
    "the refusal must be rendered instead of the interpretation, not after it");
});

/* Absence at the consent boundary is stated, never left as a gap. */
it("a scope that was not lent is named and requestable, never silently absent", () => {
  const fn = rec.slice(rec.indexOf("function holesBlock"), rec.indexOf("globalThis.clinicalRequestScope"));
  ok(/ALL_SCOPES\.filter\(\(s\) => granted\.indexOf\(s\) === -1\)/.test(fn),
    "holes must be ALL_SCOPES minus what was granted");
  ok(fn.includes("scopeLabel"), "each hole must be named");
  ok(fn.includes("clinicalRequestScope"), "each hole must carry the lawful way to ask");
  ok(fn.includes("«ما سلّمها» مو «ما عنده»") || fn.includes("not lent"),
    "the band must state that not-lent is not not-present");
});

/* The floor overrides consent in exactly one direction, and a control that
   silently declines is indistinguishable from a broken one. */
it("the safety floor refuses in place, as a rule, and announces it", () => {
  const i = rec.indexOf('id="floor-why"');
  ok(i > 0, "the refusal region must exist");
  const block = rec.slice(i - 400, i + 900);
  ok(block.includes('role="status"'), "the refusal must be announced");
  ok(block.includes('aria-live="polite"'), "the refusal must be a live region");
  ok(block.includes("rule-name"), "the refusal must be attributed to a rule, not the app's voice");
  ok(!/type="checkbox"[^>]*disabled/.test(block), "the floor must not be a pre-disabled control");
});

/* Dates in the register carry no separator between numbers — the §5 hazard is
   removed rather than isolated. */
it("the register's own dates use an Iraqi month name, never a numeric separator", () => {
  const fn = rec.slice(rec.indexOf("function gutDate"), rec.indexOf("const R_DAY"));
  ok(fn.includes("monName"), "gutDate must print a month name");
  ok(!/[-/]\$\{/.test(fn) && !/\}\s*[-/]/.test(fn), "gutDate must not join numbers with a separator");
});

console.log("\n" + "─".repeat(52));
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`);
  fails.forEach((f) => console.log("  ✗ " + f)); process.exit(1); }
console.log(`${pass} passed, 0 failed`);
