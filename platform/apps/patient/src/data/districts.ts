/**
 * The district list, bundled.
 *
 * @blueprint E8 · E12
 * @owner patient-app
 * @why E8's Blueprint row states the offline rule as «District list is
 *      bundled», and the screen's fixed note says location is never requested:
 *      the list IS the route rather than the consolation prize for refusing a
 *      permission. A bundled list is therefore a design requirement, not a
 *      convenience — a district picker that needs a network call cannot be
 *      shown to a patient with no signal, and one that asks for GPS is the
 *      moment a cautious person stops.
 *
 *      It lives here, once, because it was previously a fixture inside the
 *      review gallery: the gallery drew E8 from four districts and the running
 *      application had none at all, so the screen a reviewer approved and the
 *      screen a patient would see were reading different data. Two lists is
 *      one list and one decoy.
 *
 *      WHAT IS NOT SETTLED: these four districts are the ones E8 has been drawn
 *      and reviewed against since it was designed. They are Baghdad districts
 *      and `covered` marks which of them Dawai serves, but the real coverage
 *      list is a product input that Blueprint v3 does not carry (TD-17). It
 *      is not invented here: the shape is the Blueprint's, the contents are
 *      replaced wholesale when product supplies them, and nothing in the app
 *      hard-codes an id from this file.
 */
import type { District } from "../model/onboarding.js";

export const DISTRICTS: readonly District[] = [
  { districtId: "d1", name: "الكرادة", city: "بغداد", covered: true },
  { districtId: "d2", name: "المنصور", city: "بغداد", covered: true },
  { districtId: "d3", name: "زيونة", city: "بغداد", covered: true },
  /** E12 exists because some districts are not served, and a list that hides
   *  them tells a patient in one that the app simply does not know their area.
   *  It is shown, muted, with the reason on the row. */
  { districtId: "d4", name: "المشتل", city: "بغداد", covered: false },
];
