/**
 * The journeys a patient can be inside — transcribed from Blueprint v3 §7.
 *
 * @blueprint §7.1 · §7.2 · §7.3 · §5
 * @owner patient-app
 * @why This is patient CONTENT, not navigation machinery. The goal and the step
 *      labels are the words a patient reads when a journey is interrupted, and
 *      they belong to this app the way its screen contracts do — @dawai/navigation
 *      runs the pharmacy and owner graphs too, and a shared package holding one
 *      persona's sentences is a package with an opinion about one app's screens.
 *
 *      What stayed in navigation is everything that is not words: Flow, FlowStep,
 *      progressAt and auditFlow work on any persona's journeys.
 */
import type { Flow } from "@dawai/navigation";

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
