/**
 * Everything the review page states about the product, collected by IMPORTING
 * the real modules rather than by parsing or by hand.
 *
 * This is the rule that keeps the review honest: if a fact appears on the page,
 * it came from the same source the app runs on. A hand-written summary would
 * drift the first time a screen changed, and a review that drifts is worse than
 * no review — it is a document that says the work is done.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

import { CORE_LOOP } from "../../apps/patient/src/screens/core-loop.contract.js";
import { GRAPH, NOT_YET_BUILT, isBuilt } from "../../apps/patient/src/app/store.js";
import { PATIENT_FLOWS, ROUTE_GUARDS, unreachable, traps, danglingExits, flowGaps } from "@dawai/navigation";
import { BUSINESS_EVENT } from "@dawai/observability";
import { palettes, space, radius, tap, type as typeScale, CONTRACT_PAIRS, contrastRatio, CONTRAST, motion } from "@dawai/design";
import { REFUSAL } from "@dawai/domain";
import { SHOTS } from "./screens.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Blueprint v3's own screen inventory — the denominator for every percentage
 *  on the page, so completion cannot be quietly redefined. */
const w: Record<string, unknown> = {};
new Function("window", readFileSync(resolve(REPO, "docs/product/v3/phase0.js"), "utf8"))(w);
const PHASE0 = w["PHASE0"] as readonly Record<string, string>[];

const byId = new Map(PHASE0.map((s) => [s["id"]!, s]));
const built = CORE_LOOP.map((c) => c.id);

/** Measured, not asserted. The pairs a component can actually produce, run
 *  through the WCAG relative-luminance formula. */
const contrast = CONTRACT_PAIRS.map(([fg, bg]) => {
  const light = contrastRatio(palettes.patient.light[fg], palettes.patient.light[bg]);
  const dark = contrastRatio(palettes.patient.dark[fg], palettes.patient.dark[bg]);
  return {
    pair: `${fg} on ${bg}`,
    light: Number(light.toFixed(2)),
    dark: Number(dark.toFixed(2)),
    passes: light >= CONTRAST.bodyText && dark >= CONTRAST.bodyText,
  };
});

const data = {
  generatedFor: "patient-app · vertical slice 1 · Search → Request → Send",

  progress: {
    blueprintScreens: PHASE0.length,
    contracted: CORE_LOOP.length,
    rendered: [...new Set(SHOTS.map((s) => s.screen))].length,
    remaining: PHASE0.length - CORE_LOOP.length,
    percentContracted: Number(((CORE_LOOP.length / PHASE0.length) * 100).toFixed(1)),
  },

  screens: CORE_LOOP.map((c) => ({
    id: c.id,
    title: c.location.title,
    destination: c.location.destination,
    purpose: c.purpose,
    blueprintName: byId.get(c.id)?.["n"] ?? null,
    blueprintStates: byId.get(c.id)?.["st"] ?? "—",
    back: c.back,
    primary: c.primary,
    noPrimaryBecause: c.noPrimaryBecause ?? null,
    secondary: c.secondary,
    states: c.states,
    exits: c.exits.map((e) => ({ to: e, built: isBuilt(e) })),
    telemetry: c.telemetry,
    guards: (ROUTE_GUARDS[c.id] ?? []).map((g) => ({ name: g.name, bp: g.bp })),
    /** Screenshots that exist for this screen. */
    shots: SHOTS.filter((s) => s.screen === c.id).map((s) => ({ id: s.id, state: s.state, note: s.note })),
  })),

  /** Every Blueprint screen this build does not contain, with the reason. */
  gaps: PHASE0
    .filter((s) => !built.includes(s["id"]!))
    .map((s) => ({
      id: s["id"]!,
      group: s["g"] ?? "",
      name: s["n"] ?? "",
      purpose: s["p"] ?? "",
      /** A gap another screen's exit points at is more urgent than one nothing
       *  references yet: it is a control a patient could otherwise press. */
      referenced: NOT_YET_BUILT.includes(s["id"]!),
    })),

  graph: {
    nodes: CORE_LOOP.map((c) => ({ id: c.id, destination: c.location.destination, built: true })),
    pending: NOT_YET_BUILT.map((id) => ({ id, destination: byId.get(id)?.["g"] ?? "", built: false })),
    edges: CORE_LOOP.flatMap((c) => c.exits.map((e) => ({ from: c.id, to: e, built: isBuilt(e) }))),
    entryPoints: GRAPH.entryPoints,
    unreachable: unreachable(GRAPH),
    traps: traps(GRAPH),
    dangling: danglingExits(GRAPH),
    flowGaps: flowGaps(GRAPH, PATIENT_FLOWS),
  },

  flows: PATIENT_FLOWS.map((f) => ({
    id: f.id, goal: f.goal, completesAt: f.completesAt, abandonsTo: f.abandonsTo,
    steps: f.steps.map((s) => ({ ...s, built: isBuilt(s.screen) })),
  })),

  analytics: Object.entries(BUSINESS_EVENT).map(([key, event]) => ({ key, event })),

  refusals: Object.keys(REFUSAL),

  design: {
    palette: { light: palettes.patient.light, dark: palettes.patient.dark },
    space, radius, tap, type: typeScale, motion,
    contrast,
    contrastFloor: CONTRAST,
  },

  shots: SHOTS.map((s) => ({ id: s.id, screen: s.screen, state: s.state, note: s.note })),
};

mkdirSync(resolve(REPO, "review"), { recursive: true });
writeFileSync(resolve(REPO, "review/data.json"), JSON.stringify(data, null, 2), "utf8");
console.log(`collected review data: ${data.screens.length} screens, ${data.shots.length} states, ${data.gaps.length} gaps`);
