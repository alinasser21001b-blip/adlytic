/**
 * Flows — the thing that stops the app feeling like a collection of pages.
 *
 * @blueprint §5 · §7 · S1 · R1 · R6 · R7 · R8 · V1 · V2
 * @owner patient-app
 * @why Principle 2 says the user must always understand where they are, what
 *      came before, what comes next, and how far along they are. None of that
 *      is a property of a screen — it is a property of the JOURNEY the screen
 *      sits in. Declaring flows once means every screen can answer all four
 *      without any screen hard-coding an answer, and it makes "no dead ends" a
 *      graph property that a test can check rather than a claim.
 * @implements navigation/flow
 */

export type FlowStep = {
  /** Blueprint v3 screen id. */
  readonly screen: string;
  /** What the user is doing here, in their words. Shown as progress, so it is
   *  a verb phrase and never a screen name. */
  readonly label: string;
  /** A step the user may skip without leaving the flow — a prescription photo
   *  is only required for some request lines. Skipped steps are not counted in
   *  the progress denominator, so "٢ من ٣" never counts a step that will not
   *  happen. */
  readonly optional: boolean;
};

export type Flow = {
  readonly id: string;
  /** What the user is trying to achieve. Shown when the flow is interrupted,
   *  so resuming does not require the user to remember. */
  readonly goal: string;
  readonly steps: readonly FlowStep[];
  /** Where the flow lands when it succeeds. */
  readonly completesAt: string;
  /** Where the flow lands when the user abandons it. Never nowhere. */
  readonly abandonsTo: string;
  readonly bp: string;
};

export type Progress = {
  readonly stepIndex: number;
  readonly totalSteps: number;
  readonly label: string;
  readonly previous: FlowStep | null;
  readonly next: FlowStep | null;
  readonly goal: string;
};

/**
 * Where am I, what came before, what comes next, how far along.
 *
 * `skipped` names optional steps this particular journey will not take, so the
 * denominator reflects what will actually happen rather than what could.
 */
export function progressAt(
  flow: Flow,
  screen: string,
  skipped: readonly string[] = [],
): Progress | null {
  const live = flow.steps.filter((s) => !(s.optional && skipped.includes(s.screen)));
  const i = live.findIndex((s) => s.screen === screen);
  if (i === -1) return null;
  return {
    stepIndex: i + 1,
    totalSteps: live.length,
    label: live[i]!.label,
    previous: i > 0 ? live[i - 1]! : null,
    next: i + 1 < live.length ? live[i + 1]! : null,
    goal: flow.goal,
  };
}

/** Every flow a patient can be inside. Transcribed from Blueprint v3 §7. */
export const PATIENT_FLOWS: readonly Flow[] = [
  {
    id: "request-medicine",
    goal: "تطلب دواء وتحجزه من صيدلية قريبة",
    bp: "§7.1 · §7.2 · §7.3",
    steps: [
      { screen: "R1", label: "تختار الدواء", optional: false },
      { screen: "R2", label: "تصوّر الوصفة", optional: true },
      { screen: "R6", label: "تأكيد وإرسال", optional: false },
      { screen: "R7", label: "تنتظر الردود", optional: false },
      { screen: "R8", label: "تختار العرض", optional: false },
      { screen: "V1", label: "نحجز لك", optional: false },
    ],
    completesAt: "V2",
    abandonsTo: "S1",
  },
];

/**
 * Structural audit. A flow whose steps do not chain, or that lands nowhere,
 * would leave a user stranded mid-journey — which principle 2 forbids.
 */
export function auditFlow(flow: Flow): readonly string[] {
  const p: string[] = [];
  if (!flow.steps.length) p.push(`${flow.id}: no steps`);
  if (!flow.goal.trim()) p.push(`${flow.id}: no goal — an interrupted user cannot be reminded why they were here`);
  if (!flow.completesAt) p.push(`${flow.id}: does not say where success lands`);
  if (!flow.abandonsTo) p.push(`${flow.id}: does not say where abandonment lands`);
  const seen = new Set<string>();
  for (const s of flow.steps) {
    if (seen.has(s.screen)) p.push(`${flow.id}: screen "${s.screen}" appears twice`);
    seen.add(s.screen);
    if (!s.label.trim()) p.push(`${flow.id}: step "${s.screen}" has no label to show as progress`);
  }
  if (flow.steps.every((s) => s.optional)) p.push(`${flow.id}: every step is optional — this is not a flow`);
  return p;
}
