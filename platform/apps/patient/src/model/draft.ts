/**
 * R1 — the draft request, and every refusal that can happen while building it.
 *
 * @blueprint R1 · R2 · R4 · R5 · D06 · D07 · D09 · D18 · D42 · clinical.gate.refused
 * @owner patient-app
 * @why R1's purpose is "assemble the lines to ask for", and it is where the two
 *      clinical gates in Phase 0 actually bite. Rule 4 forbids the screen from
 *      deciding either: `add` asks `Clinical.gateRequestLine` and
 *      `Marketplace.checkLineCount`, and every refusal it returns is a domain
 *      `Refusal` code rather than a message this layer invented. The draft is a
 *      value, so a half-built request survives an interruption unchanged (D26)
 *      and can be put in a pending intent without serialising a component.
 */
import { Clinical, Marketplace, isErr, type Refusal } from "@dawai/domain";
import type { CatalogueHit, RequestSubmission } from "../ports.js";

export type DraftLine = {
  readonly itemId: string;
  readonly name: string;
  readonly latinName: string;
  readonly form: string;
  readonly strength: string;
  readonly packs: number;
  readonly requiresPrescription: boolean;
  /** D18 — a prescription-required line cannot be sent without one. Null here
   *  is not an error while drafting; it is an error at send, and R1 says so
   *  inline rather than letting the patient discover it at R6. */
  readonly prescriptionImageId: string | null;
};

export type Draft = {
  readonly subjectId: string;
  readonly districtId: string;
  readonly urgency: Marketplace.Urgency;
  readonly lines: readonly DraftLine[];
};

/** A new draft. The urgency default is "today", the middle of D09's three
 *  windows — "now" would overstate every request and "soon" would understate
 *  the frightened ones. R5 is one tap away either way. */
export const newDraft = (subjectId: string, districtId: string): Draft => ({
  subjectId, districtId, urgency: "today", lines: [],
});

/**
 * Add a line. Both gates are asked before the line exists, so a refused item
 * never reaches the draft — the alternative is a list the patient assembles
 * and then cannot send, which is the failure R1's error state exists to
 * prevent.
 */
export function add(draft: Draft, hit: CatalogueHit, packs = 1): { draft: Draft; refusal: Refusal | null } {
  const gate = Clinical.gateRequestLine(
    { requestable: hit.requestable, requiresPrescription: hit.requiresPrescription, isControlled: hit.isControlled },
    // Drafting: the prescription may still be photographed at R2. Only `send`
    // requires the image to be present.
    true,
  );
  if (isErr(gate)) return { draft, refusal: gate.error };

  const count = Marketplace.checkLineCount(draft.lines.length + 1);
  if (isErr(count)) return { draft, refusal: count.error };

  const quantity = Marketplace.packs(packs);
  if (isErr(quantity)) return { draft, refusal: quantity.error };

  // The same medicine added twice is one line with more packs, not two lines.
  // Two identical lines would consume the D07 line budget and confuse a
  // pharmacist reading the request.
  const existing = draft.lines.findIndex((l) => l.itemId === hit.itemId);
  if (existing !== -1) {
    const current = draft.lines[existing]!;
    const merged = Marketplace.packs(current.packs + packs);
    if (isErr(merged)) return { draft, refusal: merged.error };
    return {
      draft: { ...draft, lines: draft.lines.map((l, i) => (i === existing ? { ...l, packs: merged.value } : l)) },
      refusal: null,
    };
  }

  return {
    draft: {
      ...draft,
      lines: [...draft.lines, {
        itemId: hit.itemId, name: hit.name, latinName: hit.latinName,
        form: hit.form, strength: hit.strength, packs: quantity.value,
        requiresPrescription: hit.requiresPrescription, prescriptionImageId: null,
      }],
    },
    refusal: null,
  };
}

export function remove(draft: Draft, itemId: string): Draft {
  return { ...draft, lines: draft.lines.filter((l) => l.itemId !== itemId) };
}

/** D07 — the unit is the pack. A quantity below one removes the line, because
 *  a stepper that stops at one traps a user trying to undo a mis-tap. */
export function setPacks(draft: Draft, itemId: string, packs: number): { draft: Draft; refusal: Refusal | null } {
  if (packs < 1) return { draft: remove(draft, itemId), refusal: null };
  const quantity = Marketplace.packs(packs);
  if (isErr(quantity)) return { draft, refusal: quantity.error };
  return {
    draft: { ...draft, lines: draft.lines.map((l) => (l.itemId === itemId ? { ...l, packs: quantity.value } : l)) },
    refusal: null,
  };
}

/** R5 — the urgency window, one of exactly three (D09). */
export const setUrgency = (draft: Draft, urgency: Marketplace.Urgency): Draft => ({ ...draft, urgency });

/** R4 — who the medicine is for. Changing it does not clear the lines: the
 *  patient realising mid-draft that this is for their mother should not have
 *  to type it all again. */
export const setSubject = (draft: Draft, subjectId: string): Draft => ({ ...draft, subjectId });

/** R2/R3 — the photographed prescription, attached to every line that needs
 *  one. One photo commonly covers the whole paper, so it attaches to all of
 *  them rather than making the patient photograph the same sheet four times. */
export function attachPrescription(draft: Draft, imageId: string): Draft {
  return {
    ...draft,
    lines: draft.lines.map((l) => (l.requiresPrescription ? { ...l, prescriptionImageId: imageId } : l)),
  };
}

/** Lines still missing the paper. R1 and R6 both read this — R1 to prompt, R6
 *  to refuse. */
export const linesNeedingPrescription = (draft: Draft): readonly DraftLine[] =>
  draft.lines.filter((l) => l.requiresPrescription && l.prescriptionImageId === null);

/**
 * Is this sendable, and if not, exactly why. Called by R6 before it enables
 * its primary action and again by `submit`, because a disabled button is a
 * courtesy and never a control (§5 rule 1).
 */
export function validate(draft: Draft): Refusal | null {
  const count = Marketplace.checkLineCount(draft.lines.length);
  if (isErr(count)) return count.error;
  for (const line of draft.lines) {
    const gate = Clinical.gateRequestLine(
      { requestable: true, requiresPrescription: line.requiresPrescription, isControlled: false },
      line.prescriptionImageId !== null,
    );
    if (isErr(gate)) return gate.error;
  }
  return null;
}

/** The payload for POST /v1/requests. Refuses rather than emitting a partial
 *  body, so an invalid request cannot reach the outbox. */
export function submission(draft: Draft): { value: RequestSubmission | null; refusal: Refusal | null } {
  const refusal = validate(draft);
  if (refusal) return { value: null, refusal };
  return {
    value: {
      subjectId: draft.subjectId,
      urgency: draft.urgency,
      districtId: draft.districtId,
      lines: draft.lines.map((l) => ({ itemId: l.itemId, packs: l.packs, prescriptionImageId: l.prescriptionImageId })),
    },
    refusal: null,
  };
}

/** How many more lines the patient may add, shown on R1 so the limit is a
 *  fact they can see rather than a wall they hit. */
export const remainingLines = (draft: Draft): number => Marketplace.MAX_REQUEST_LINES - draft.lines.length;

/** Whether the draft is worth preserving across an interruption (D26). An
 *  empty draft is not — restoring one would be noise. */
export const worthPreserving = (draft: Draft): boolean => draft.lines.length > 0;
