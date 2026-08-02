/**
 * Clinical gates — the whole of Phase 0's clinical safety.
 *
 * @blueprint §7 · D16 · D17 · D18 · D19 · D42
 * @owner clinical-engine
 * @why Blueprint v3 §7 is unusually explicit that Phase 0 performs NO automated
 *      clinical checking, and that a partial check a user believes is complete
 *      is more dangerous than a stated absence. This module therefore contains
 *      only refusals and authorisations — it never returns "safe", "clear" or
 *      "no interactions found", and there is no code path that could.
 * @implements clinical/gates
 */
import { type Result, ok, err } from "../shared/result.js";
import { type Refusal, refuse, REFUSAL } from "../shared/refusal.js";

/**
 * The gate's only two outcomes. There is deliberately no SAFE, no CLEAR and no
 * CHECKED — D16 removed interaction checking from Phase 0 entirely, so a value
 * meaning "we looked and it is fine" would be a lie the type system permitted.
 */
export type GateOutcome = "ALLOWED" | "REFUSED";

export type CatalogueFacts = {
  readonly requestable: boolean;
  readonly requiresPrescription: boolean;
  readonly isControlled: boolean;
};

/**
 * D18 — a prescription-required line cannot exist without an image.
 * D42 — a controlled item cannot be requested at all.
 *
 * ALLOWED means only "this line may be created". It carries no clinical claim
 * whatsoever, which is why the type is not called `SafetyResult`.
 */
export function gateRequestLine(
  item: CatalogueFacts,
  hasPrescriptionImage: boolean,
): Result<GateOutcome, Refusal> {
  if (item.isControlled) return err(refuse(REFUSAL.CONTROLLED_NOT_SUPPORTED));
  if (!item.requestable) return err(refuse(REFUSAL.ITEM_NOT_REQUESTABLE));
  if (item.requiresPrescription && !hasPrescriptionImage)
    return err(refuse(REFUSAL.PRESCRIPTION_REQUIRED));
  return ok("ALLOWED");
}

/**
 * D19 — confirming a reservation is COMMERCIAL and any signed-in staff member
 * may do it. Proposing a substitution is CLINICAL and requires a verified
 * pharmacist licence.
 *
 * v1 required a pharmacist for every confirmation, which no real Iraqi pharmacy
 * could honour on an evening shift — producing an audit log full of
 * attestations that were routinely false, which is worse than no control.
 */
export type StaffFacts = {
  readonly role: "assistant" | "pharmacist" | "manager";
  readonly licenceVerified: boolean;
};

export function mayConfirmReservation(_staff: StaffFacts): Result<GateOutcome, Refusal> {
  // Deliberately unconditional for any signed-in staff member. The parameter is
  // kept so the call site reads the same as its clinical sibling, and so this
  // decision is visible at the one place a reviewer would look for it.
  return ok("ALLOWED");
}

export function mayProposeSubstitution(staff: StaffFacts): Result<GateOutcome, Refusal> {
  if (staff.role !== "pharmacist" || !staff.licenceVerified)
    return err(refuse(REFUSAL.SUBSTITUTION_REQUIRES_PHARMACIST));
  return ok("ALLOWED");
}

/**
 * §7 control 2 — the handover checklist. Three fixed items, all recorded.
 * `prescriptionSeen` is only required when the line was prescription-required,
 * and only a pharmacist may attest it.
 */
export type Checklist = {
  readonly prescriptionSeen: boolean;
  readonly allergyAsked: boolean;
  readonly packsConfirmed: boolean;
};

export function gateHandover(
  checklist: Checklist,
  anyLineRequiresPrescription: boolean,
  staff: StaffFacts,
): Result<GateOutcome, Refusal> {
  if (!checklist.allergyAsked || !checklist.packsConfirmed)
    return err(refuse(REFUSAL.ILLEGAL_TRANSITION, { reason: "checklist_incomplete" }));
  if (anyLineRequiresPrescription) {
    if (!checklist.prescriptionSeen)
      return err(refuse(REFUSAL.ILLEGAL_TRANSITION, { reason: "prescription_not_seen" }));
    if (staff.role !== "pharmacist" || !staff.licenceVerified)
      return err(refuse(REFUSAL.REQUIRES_PHARMACIST));
  }
  return ok("ALLOWED");
}
