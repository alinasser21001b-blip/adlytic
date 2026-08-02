/**
 * Wording a domain refusal.
 *
 * @blueprint §23 · D18 · D42 · D19 · domain/refusal
 * @owner patient-app
 * @why Rule 4 in both directions: the domain decides WHETHER, and it returns a
 *      code with structured detail rather than a sentence, because a rule that
 *      formats prose is a rule that has an opinion about a screen. Wording is
 *      the app's job and it happens exactly here, so the same refusal never
 *      reads two different ways in two places, and a code with no wording is a
 *      compile error rather than a raw enum shown to a patient.
 */
import type { Refusal } from "@dawai/domain";

/** What the patient reads, and what they can do about it. `action` is null
 *  where there is genuinely nothing to press — §23 forbids inventing one. */
export type Worded = { readonly says: string; readonly action: string | null };

export function word(refusal: Refusal): Worded {
  switch (refusal.code) {
    // D42 — states the boundary as a fact about the app, not a judgement about
    // the patient, and points at the thing that does work.
    case "CONTROLLED_NOT_SUPPORTED":
      return { says: "هذا الدواء ما ينطلب من التطبيق — لازم تروح للصيدلية بنفسك", action: null };
    case "ITEM_NOT_REQUESTABLE":
      return { says: "هذا ما ينطلب من التطبيق", action: null };
    // D18 — the fixable condition, named.
    case "PRESCRIPTION_REQUIRED":
      return { says: "هذا الدواء يحتاج وصفة — صوّرها وكمّل", action: "صوّر الوصفة" };
    case "TOO_MANY_LINES":
      return { says: `تكدر تطلب ${refusal.detail?.["max"] ?? 8} أدوية بالطلب الواحد — شيل واحد وضيف غيره`, action: null };
    case "NO_LINES":
      return { says: "ما ضيّفت أي دواء بعد", action: "دوّر على دواء" };
    case "PRICE_REQUIRED":
      return { says: "العدد لازم يكون علبة وحدة على الأقل", action: null };
    case "OUTSIDE_COVERAGE":
      return { says: "ما عدنا صيدليات بمنطقتك بعد", action: null };
    case "OFFER_WITHDRAWN":
      return { says: "هذا العرض انسحب قبل ثواني", action: "شوف العروض الباقية" };
    case "OFFER_EXPIRED":
      return { says: "انتهى وقت هذا العرض", action: "شوف العروض الباقية" };
    case "ALREADY_ACCEPTED":
      return { says: "هذا الطلب محجوز من قبل", action: null };
    case "NOTHING_ACCEPTED":
      return { says: "اختر شنو تحجز أول", action: null };
    // §5 rule 3 — a missing record and a forbidden one read identically, so no
    // screen becomes an oracle telling a stranger that someone exists.
    case "NOT_FOUND_OR_NOT_YOURS":
      return { says: "ما لكيناه", action: null };
    case "SUBJECT_MEMORIALISED":
      return { says: "هذا السجل صار للقراءة فقط", action: null };
    default:
      // Deliberately vague and deliberately actionable: the remaining codes
      // belong to flows this slice does not build, and inventing wording for a
      // refusal the patient cannot reach would be inventing behaviour.
      return { says: "ما كدرنا نكمّل هذي الخطوة", action: "أعد المحاولة" };
  }
}
