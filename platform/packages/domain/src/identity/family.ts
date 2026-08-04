/**
 * Family rules — guardianship, claiming, and the limits Blueprint v3 fixed.
 *
 * @blueprint §9 · D01 · D02 · D03 · D04 · D05
 * @owner identity-service
 * @why This is the change that reaches furthest in the product, because v1
 *      could not represent its own primary persona: it required an elderly
 *      woman who uses only WhatsApp to own a smartphone and approve on her own
 *      device. Managed subjects exist so that the median chronic patient is
 *      representable at all.
 * @implements identity/family
 */
import { type Result, ok, err } from "../shared/result.js";
import { type Refusal, refuse, REFUSAL } from "../shared/refusal.js";
import { type Instant, DAY, minus } from "../shared/instant.js";
import type { Scope } from "./authority.js";

/** §4 S3 — a guardian may hold at most six managed subjects. */
export const MANAGED_SUBJECT_LIMIT = 6;

/** D02 — a peer-grant invitation to any number expires after seven days. */
export const INVITE_TTL_MS = 7 * DAY;

/** D04 — memorialisation reverses within thirty days, and not after. */
export const MEMORIAL_REVERSAL_MS = 30 * DAY;

/** D05 — the account-deletion window. */
export const DELETION_WINDOW_MS = 30 * DAY;

export function canAddManagedSubject(currentCount: number): Result<number, Refusal> {
  if (currentCount >= MANAGED_SUBJECT_LIMIT)
    return err(refuse(REFUSAL.MANAGED_SUBJECT_LIMIT, { limit: MANAGED_SUBJECT_LIMIT }));
  return ok(currentCount + 1);
}

export function inviteStillValid(invitedAt: Instant, now: Instant): Result<true, Refusal> {
  if (minus(now, invitedAt) > INVITE_TTL_MS) return err(refuse(REFUSAL.INVITE_EXPIRED));
  return ok(true);
}

export function canReverseMemorialisation(memorialisedAt: Instant, now: Instant): Result<true, Refusal> {
  if (minus(now, memorialisedAt) > MEMORIAL_REVERSAL_MS)
    return err(refuse(REFUSAL.REVERSAL_WINDOW_PASSED));
  return ok(true);
}

/**
 * D01 — on claim, guardianship ENDS and the former guardian is left holding a
 * peer grant the new account holder may revoke. It does not weaken, and it is
 * not retained silently.
 */
export type ClaimOutcome = {
  readonly guardianshipEnded: true;
  readonly formerGuardianGrantScope: Scope;
  readonly revocableByNewAccountHolder: true;
};

export function claim(alreadySelf: boolean): Result<ClaimOutcome, Refusal> {
  if (alreadySelf) return err(refuse(REFUSAL.ALREADY_SELF));
  return ok({
    guardianshipEnded: true,
    // The former guardian keeps the narrower of the two scopes. Handing back
    // `order` by default would make the claim cosmetic.
    formerGuardianGrantScope: "view",
    revocableByNewAccountHolder: true,
  });
}

/**
 * D05 — deleting a guardian account forces an explicit choice for EVERY managed
 * subject. There is no default, deliberately: a default here silently decides
 * the fate of another person's medical record.
 */
export type Disposition = { readonly subjectId: string; readonly action: "transfer" | "delete" };

export function checkDispositions(
  managedSubjectIds: readonly string[],
  dispositions: readonly Disposition[],
): Result<readonly Disposition[], Refusal> {
  const managed = new Set(managedSubjectIds);

  /*
   * Every subject in the list must be one this guardian actually manages.
   *
   * This checked only that every managed subject was DECIDED, and returned the
   * list unchanged — so a disposition naming someone else's subject was
   * accepted and handed back as an instruction to transfer or delete their
   * record. `Marketplace.accept`, the same shape one module over, has always
   * checked this direction and refuses with NOT_FOUND_OR_NOT_YOURS; this did
   * not.
   *
   * §5 rule 3: a record that does not exist and a record that is not yours
   * read identically, so no caller learns whether a subject id is real by
   * being told which way it failed.
   */
  for (const d of dispositions)
    if (!managed.has(d.subjectId))
      return err(refuse(REFUSAL.NOT_FOUND_OR_NOT_YOURS, { subject: d.subjectId }));

  /*
   * And each is decided exactly once. Two entries for one subject — one
   * "transfer", one "delete" — both passed, leaving the caller holding
   * contradictory instructions about a person's medical record and no rule
   * about which wins. D05 says the choice is explicit; two choices is not one.
   */
  const seen = new Set<string>();
  for (const d of dispositions) {
    if (seen.has(d.subjectId))
      return err(refuse(REFUSAL.DEPENDENT_DISPOSITION_MISSING, { subject: d.subjectId, decidedTwice: true }));
    seen.add(d.subjectId);
  }

  const missing = managedSubjectIds.filter((id) => !seen.has(id));
  if (missing.length)
    return err(refuse(REFUSAL.DEPENDENT_DISPOSITION_MISSING, { count: missing.length, first: missing[0]! }));
  return ok(dispositions);
}
