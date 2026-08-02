/**
 * Authority — the single question the domain answers about permission.
 *
 * @blueprint §5 · §9 · D01 · D03
 * @owner identity-service
 * @why §5 rule 2 says authority is checked where the work happens, and §5 rule 3
 *      says a missing relationship must be indistinguishable from a forbidden
 *      one — v1's family endpoint became an identity oracle by returning 403
 *      where it should have returned 404. Both rules are structural here:
 *      there is exactly one function, and it has exactly one refusal.
 * @implements identity/authority
 */
import { type Result, ok, err } from "../shared/result.js";
import { type Refusal, refuse, REFUSAL } from "../shared/refusal.js";
import type { AccountId, SubjectId } from "../shared/ids.js";

/** §5 — scopes are ordered and additive. There is no `confirm` scope in Phase 0
 *  because there are no dose events to confirm (§10 change 1). */
export const SCOPES = ["view", "order"] as const;
export type Scope = (typeof SCOPES)[number];

const RANK: Readonly<Record<Scope, number>> = { view: 1, order: 2 };

export type Relationship =
  | { readonly kind: "self"; readonly account: AccountId; readonly subject: SubjectId }
  | { readonly kind: "guardian"; readonly account: AccountId; readonly subject: SubjectId }
  | { readonly kind: "peer"; readonly account: AccountId; readonly subject: SubjectId; readonly scope: Scope };

export type SubjectFacts = { readonly memorialised: boolean };

/**
 * May this account act on this subject at this scope?
 *
 * Throws nothing and returns one refusal only. A caller cannot learn whether a
 * subject exists by the shape of the answer.
 *
 * §5 rule 4 — least privilege wins on ambiguity: when several relationships
 * could apply, the NARROWEST sufficient one is used, never the first found.
 */
export function authorise(
  relationships: readonly Relationship[],
  account: AccountId,
  subject: SubjectId,
  need: Scope,
  subjectFacts: SubjectFacts,
): Result<Relationship, Refusal> {
  const applicable = relationships.filter((r) => r.account === account && r.subject === subject);

  const sufficient = applicable.filter((r) =>
    r.kind === "self" || r.kind === "guardian" ? true : RANK[r.scope] >= RANK[need],
  );
  if (sufficient.length === 0) return err(refuse(REFUSAL.NOT_FOUND_OR_NOT_YOURS));

  // Narrowest first: a peer grant is narrower than guardianship, which is
  // narrower than self. Within peers, the lower scope is narrower.
  const narrowness = (r: Relationship): number =>
    r.kind === "peer" ? RANK[r.scope] : r.kind === "guardian" ? 10 : 20;
  const chosen = [...sufficient].sort((a, b) => narrowness(a) - narrowness(b))[0]!;

  // D04 — a memorialised subject accepts no new activity. Read stays open for
  // existing grant holders, so only `order` is refused.
  if (subjectFacts.memorialised && need === "order")
    return err(refuse(REFUSAL.SUBJECT_MEMORIALISED));

  return ok(chosen);
}
