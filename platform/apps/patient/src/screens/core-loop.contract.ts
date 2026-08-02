/**
 * UX contracts for the patient core loop.
 *
 * @blueprint S1 · S2 · F1 · F2 · F3 · F4 · R1 · R2 · R3 · R4 · R5 · R6 · R7 · R8 · R9 · R11 · R13 · V1 · V2 · V4 · V5 · V7 · V8
 * @owner patient-app
 * @why Stage 6 builds screens; this declares what each one owes the user
 *      BEFORE any of them is built, so a screen cannot be called finished
 *      while it leaves someone wondering where they are or what to do next.
 *      Every purpose, entry, exit and state below is transcribed from
 *      Blueprint v3 §4 — tools/ux-check.mjs fails the build if a contract
 *      names a screen the Blueprint does not contain, drops a state the
 *      Blueprint declares, or exits nowhere.
 */
import type { ScreenContract } from "@dawai/design";

export const CORE_LOOP: readonly ScreenContract[] = [
  {
    id: "S1",
    location: { title: "اليوم", destination: "today" },
    purpose: "What is happening right now",
    // Root of a tab: the OS back gesture leaves the app, which is correct and
    // must be stated rather than silently true.
    back: { kind: "none", why: "root of the Today tab — the OS gesture exits the app" },
    primary: { label: "أطلب دواء", leadsTo: "R1", tapsToOutcome: 1 },
    secondary: [
      { label: "لمن؟", leadsTo: "S2" },
      { label: "سجل الاستلام", leadsTo: "V8" },
    ],
    states: [
      { kind: "loading", skeletonMatchesContent: true },
      // §22 names two DIFFERENT states here and the Blueprint declares both.
      // "empty" is a brand-new account with nothing yet, and it must teach:
      // it is the highest-attention moment in the product.
      { kind: "empty", explains: "هنا راح تشوف حجوزاتك وأدويتك اللي استلمتها",
        action: { label: "أطلب أول دواء", leadsTo: "R1" }, isSuccess: false },
      // "quiet" is a well-managed patient on an ordinary day. It is
      // reassurance, not absence, and offering an action here would invent
      // urgency the user does not have.
      { kind: "empty", explains: "كل شي تمام — ما عندك شي يحتاج انتباهك هسه",
        action: null, isSuccess: true },
      { kind: "offline", readOnly: true, showsAge: true },
      { kind: "error", whatFailed: "ما كدرنا نحدّث الصفحة", workPreserved: true,
        action: { label: "أعد المحاولة", leadsTo: "S1" } },
    ],
    exits: ["R1", "S2", "V2", "V8"],
    telemetry: [],
    persona: "patient",
  },
  {
    id: "F1",
    location: { title: "ابحث", destination: "find" },
    purpose: "Start anything new",
    back: { kind: "none", why: "root of the Find tab" },
    primary: { label: "دوّر على دواء", leadsTo: "F2", tapsToOutcome: 1 },
    secondary: [
      { label: "صيدليات قريبة", leadsTo: "F5" },
      { label: "صوّر وصفة", leadsTo: "R2" },
    ],
    states: [
      { kind: "empty", explains: "دوّر باسم الدواء، أو صوّر الوصفة",
        action: { label: "صوّر وصفة", leadsTo: "R2" }, isSuccess: false },
      { kind: "offline", readOnly: true, showsAge: true },
    ],
    exits: ["F2", "F5", "R2"],
    telemetry: [],
    persona: "patient",
  },
  {
    id: "F2",
    location: { title: "نتائج البحث", destination: "find" },
    purpose: "Find a catalogue item the way people actually type",
    back: { kind: "pop" },
    primary: { label: "أطلب هذا الدواء", leadsTo: "R1", tapsToOutcome: 1 },
    secondary: [{ label: "شوف التفاصيل", leadsTo: "F3" }],
    states: [
      { kind: "loading", skeletonMatchesContent: true },
      // §13.1 — the catalogue is incomplete, not the patient wrong. A bare "no
      // results" is what this replaces, and the miss feeds catalogue growth.
      { kind: "empty", explains: "ما لكيناه بقائمتنا — ممكن يكون موجود بالصيدليات",
        action: { label: "أطلبه بالاسم مع صورة", leadsTo: "R1" }, isSuccess: false },
      { kind: "error", whatFailed: "ما كدرنا نوصل للبحث", workPreserved: true,
        action: { label: "أعد المحاولة", leadsTo: "F2" } },
      { kind: "offline", readOnly: true, showsAge: true },
    ],
    exits: ["F3", "R1"],
    telemetry: ["search.unmatched"],
    persona: "patient",
  },
  {
    id: "R1",
    location: { title: "طلب جديد", destination: "modal" },
    purpose: "Assemble the lines to ask for",
    back: { kind: "dismiss", returnsTo: "S1" },
    primary: { label: "كمّل", leadsTo: "R6", tapsToOutcome: 1 },
    secondary: [
      { label: "ضيف دواء ثاني", leadsTo: "F2" },
      { label: "صوّر الوصفة", leadsTo: "R2" },
      { label: "لمن؟", leadsTo: "R4" },
    ],
    states: [
      { kind: "empty", explains: "ضيف الدواء اللي تحتاجه — تكدر تضيف لحد ٨",
        action: { label: "دوّر على دواء", leadsTo: "F2" }, isSuccess: false },
      // The refusal is inline and immediate: a controlled item is refused with
      // its reason (D42), and a prescription line cannot proceed (D18).
      { kind: "error", whatFailed: "هذا الدواء ما ينطلب من التطبيق", workPreserved: true,
        action: { label: "شوف السبب", leadsTo: "F4" } },
    ],
    exits: ["F2", "R2", "R4", "R6"],
    telemetry: ["clinical.gate.refused"],
    persona: "patient",
  },
  {
    id: "R6",
    location: { title: "تأكيد الطلب", destination: "modal" },
    purpose: "Final check before it goes",
    back: { kind: "pop" },
    primary: { label: "أرسل الطلب", leadsTo: "R7", tapsToOutcome: 1 },
    secondary: [{ label: "غيّر الاستعجال", leadsTo: "R5" }],
    states: [
      { kind: "error", whatFailed: "ما وصل الطلب", workPreserved: true,
        action: { label: "أعد الإرسال", leadsTo: "R6" } },
      // D27 — a queued request is never presented as sent.
      { kind: "offline", readOnly: false, showsAge: true },
    ],
    exits: ["R5", "R7", "R13"],
    telemetry: ["request.broadcast"],
    persona: "patient",
  },
  {
    id: "R7",
    location: { title: "ننتظر الردود", destination: "modal" },
    purpose: "Make the wait legible",
    // The request is live. Leaving is possible but it is not a back — it drops
    // to Today with the request still running, which the screen says.
    back: { kind: "dismiss", returnsTo: "S1" },
    primary: { label: "شوف العروض", leadsTo: "R8", tapsToOutcome: 1 },
    secondary: [{ label: "ألغِ الطلب", leadsTo: "S1" }],
    states: [
      { kind: "loading", skeletonMatchesContent: true },
      { kind: "empty", explains: "سألنا الصيدليات القريبة — ننتظر أول رد",
        action: null, isSuccess: true },
      { kind: "error", whatFailed: "انقطع الاتصال", workPreserved: true,
        action: { label: "أعد الاتصال", leadsTo: "R7" } },
      { kind: "offline", readOnly: true, showsAge: true },
    ],
    exits: ["R8", "R11", "S1"],
    telemetry: ["request.answered", "request.unanswered"],
    persona: "patient",
  },
  {
    id: "R8",
    location: { title: "قارن العروض", destination: "modal" },
    purpose: "Choose, with the reasons visible",
    back: { kind: "pop" },
    primary: { label: "احجز من هنا", leadsTo: "V1", tapsToOutcome: 1 },
    secondary: [{ label: "شوف تفاصيل العرض", leadsTo: "R9" }],
    states: [
      { kind: "loading", skeletonMatchesContent: true },
      { kind: "empty", explains: "ما وصل عرض بعد",
        action: { label: "ارجع للانتظار", leadsTo: "R7" }, isSuccess: false },
      // A withdrawn offer between render and tap is told plainly, then the
      // list returns — never a silent failure on the most consequential tap.
      { kind: "error", whatFailed: "هذا العرض انسحب قبل ثواني", workPreserved: true,
        action: { label: "شوف العروض الباقية", leadsTo: "R8" } },
    ],
    exits: ["R9", "V1", "R7"],
    telemetry: [],
    persona: "patient",
  },
  {
    id: "R2",
    location: { title: "صوّر الوصفة", destination: "modal" },
    purpose: "Photograph the paper",
    back: { kind: "pop" },
    primary: { label: "صوّر", leadsTo: "R3", tapsToOutcome: 1 },
    // Refusing the camera is never a wall — the patient types the name instead.
    secondary: [{ label: "اكتب الاسم بدال الصورة", leadsTo: "R1" }],
    states: [
      { kind: "permissionRefused", stillUsable: true,
        alternative: "تكدر تكتب اسم الدواء بدل الصورة" },
      // The failure names the fixable condition, never the person (D37).
      { kind: "error", whatFailed: "ما نكدر نقرأ الوصفة من هذي الصورة", workPreserved: true,
        action: { label: "صوّر مرة ثانية بضوء أكثر", leadsTo: "R2" } },
    ],
    exits: ["R3", "R1"],
    telemetry: [],
    persona: "patient",
  },
  {
    id: "R3",
    location: { title: "شوف الصورة", destination: "modal" },
    purpose: "Confirm the image is readable before it travels",
    back: { kind: "pop" },
    // The patient judges legibility, not an algorithm — Phase 0 does not read
    // the prescription (D18), and pretending otherwise would be a false claim.
    primary: { label: "واضحة — كمّل", leadsTo: "R1", tapsToOutcome: 1 },
    secondary: [{ label: "صوّر مرة ثانية", leadsTo: "R2" }],
    states: [],
    exits: ["R1", "R2"],
    telemetry: [],
    persona: "patient",
  },
  {
    id: "R4",
    location: { title: "لمن الدواء؟", destination: "modal" },
    purpose: "Choose the subject",
    back: { kind: "dismiss", returnsTo: "R1" },
    primary: { label: "اختر", leadsTo: "R1", tapsToOutcome: 1 },
    secondary: [{ label: "ضيف شخص", leadsTo: "S3" }],
    states: [],
    exits: ["R1", "S3"],
    telemetry: [],
    persona: "patient",
  },
  {
    id: "R5",
    location: { title: "شكد مستعجل؟", destination: "modal" },
    purpose: "Set the window honestly",
    back: { kind: "dismiss", returnsTo: "R1" },
    primary: { label: "اختر", leadsTo: "R1", tapsToOutcome: 1 },
    secondary: [],
    states: [],
    exits: ["R1"],
    telemetry: [],
    persona: "patient",
  },
  {
    id: "R9",
    location: { title: "تفاصيل العرض", destination: "modal" },
    purpose: "One offer in full, line by line",
    back: { kind: "pop" },
    primary: { label: "احجز من هنا", leadsTo: "V1", tapsToOutcome: 1 },
    secondary: [],
    states: [
      { kind: "error", whatFailed: "هذا العرض انسحب", workPreserved: true,
        action: { label: "ارجع للعروض", leadsTo: "R8" } },
    ],
    exits: ["V1", "R8", "R10"],
    telemetry: [],
    persona: "patient",
  },
  {
    id: "R11",
    location: { title: "ما رد أحد", destination: "modal" },
    purpose: "The honest empty case",
    back: { kind: "dismiss", returnsTo: "S1" },
    primary: { label: "وسّع البحث", leadsTo: "R7", tapsToOutcome: 1 },
    secondary: [
      { label: "خبّرني إذا توفّر", leadsTo: "R12" },
      { label: "جرّب بعدين", leadsTo: "S1" },
    ],
    states: [],
    exits: ["R7", "R12", "S1"],
    telemetry: ["request.unanswered"],
    persona: "patient",
  },
  {
    id: "R13",
    location: { title: "بانتظار الإرسال", destination: "me" },
    purpose: "Everything waiting to send",
    back: { kind: "pop" },
    primary: null,
    noPrimaryBecause: "a list of pending work — the only action is per-item cancellation",
    secondary: [{ label: "ألغِ", leadsTo: "R13" }],
    states: [
      { kind: "empty", explains: "ما في شي بانتظار الإرسال", action: null, isSuccess: true },
      { kind: "error", whatFailed: "ما كدرنا نرسل هذا الطلب", workPreserved: true,
        action: { label: "أعد المحاولة", leadsTo: "R13" } },
    ],
    exits: ["S1"],
    telemetry: [],
    persona: "patient",
  },
  {
    id: "V1",
    location: { title: "نحجز لك", destination: "modal" },
    purpose: "The moment between choosing and confirmation",
    // Deliberately un-poppable: a request to set stock aside is in flight and
    // going back would leave the patient unsure whether it happened.
    back: { kind: "none", why: "a hold request is in flight; the screen resolves to V2 or V4 on its own" },
    primary: null,
    noPrimaryBecause: "the pharmacy is being asked to set stock aside; the patient waits",
    secondary: [],
    states: [{ kind: "loading", skeletonMatchesContent: true }],
    exits: ["V2", "V4", "R8"],
    telemetry: ["reservation.confirmed", "reservation.refused"],
    persona: "patient",
  },
  {
    id: "V2",
    location: { title: "محجوز لك", destination: "today" },
    purpose: "The code, the clock, the address",
    back: { kind: "replace", with: "S1", why: "the reservation lives on Today; there is no stack behind a notification" },
    primary: { label: "خذني للصيدلية", leadsTo: "V2", tapsToOutcome: 1 },
    secondary: [
      { label: "اتصل بالصيدلية", leadsTo: "V2" },
      { label: "ألغِ الحجز", leadsTo: "V5" },
    ],
    states: [
      { kind: "loading", skeletonMatchesContent: true },
      { kind: "error", whatFailed: "ما كدرنا نحدّث الوقت المتبقي", workPreserved: true,
        action: { label: "أعد المحاولة", leadsTo: "V2" } },
      // §4 V2: this is the screen that must never fail. The code stays readable
      // from cache and the countdown is labelled as last known.
      { kind: "offline", readOnly: true, showsAge: true },
    ],
    exits: ["V5", "V7", "S1"],
    telemetry: ["reservation.collected"],
    persona: "patient",
  },
  {
    id: "V4",
    location: { title: "ما كدرت الصيدلية تحجز", destination: "today" },
    purpose: "They confirmed and then could not",
    back: { kind: "replace", with: "S1", why: "arrives by notification; there is no stack behind it" },
    // D39 — the request re-opens automatically, so the primary action moves
    // the patient forward rather than asking them to start again.
    primary: { label: "شوف العروض الجديدة", leadsTo: "R8", tapsToOutcome: 1 },
    secondary: [{ label: "أوقف الطلب", leadsTo: "S1" }],
    states: [],
    exits: ["R8", "S1"],
    telemetry: ["reservation.refused"],
    persona: "patient",
  },
];
