/**
 * The published identity state machines, transcribed edge by edge.
 *
 * @blueprint §6 Subject lifecycle · §6 Grant lifecycle
 * @owner identity-service
 * @why Rule 5. The subject machine carries the single most consequential edge
 *      in the product: on claim, guardianship ENDS rather than weakening
 *      (D01). Writing it as a table is what stops that being softened later by
 *      someone who finds ending it inconvenient.
 * @implements identity/machines
 */
import { defineMachine } from "../shared/machine.js";

/* ── Subject — §6 Subject lifecycle ───────────────────────────────────── */
export type SubjectState = "self" | "managed" | "claim_pending" | "memorialised" | "deleted";

export type SubjectEvent =
  | "accountCreated" | "guardianAdds" | "sendClaimInvite" | "inviteExpiredOrRefused"
  | "numberVerified" | "transferGuardianship" | "recordDeath" | "reverse" | "delete";

export const SubjectMachine = defineMachine<SubjectState, SubjectEvent>({
  name: "Subject",
  bp: "§6 Subject lifecycle",
  initial: ["self", "managed"],
  terminal: ["deleted"],
  transitions: [
    { from: "managed", on: "sendClaimInvite", to: "claim_pending", bp: "§6 · §4 S9" },
    { from: "claim_pending", on: "inviteExpiredOrRefused", to: "managed", bp: "§6" },
    // D01: guardianship ENDS here. It does not weaken, and it is not retained
    // as an automatic grant — the former guardian holds a revocable peer grant.
    { from: "claim_pending", on: "numberVerified", to: "self", bp: "§6 · D01 guardianship ends" },
    { from: "managed", on: "transferGuardianship", to: "managed", bp: "§9 · §4 S10" },
    { from: "self", on: "recordDeath", to: "memorialised", bp: "D04" },
    { from: "managed", on: "recordDeath", to: "memorialised", bp: "D04" },
    { from: "memorialised", on: "reverse", to: "self", bp: "D04 · within 30 days" },
    { from: "self", on: "delete", to: "deleted", bp: "D05" },
    { from: "managed", on: "delete", to: "deleted", bp: "D05 · guardian chose delete" },
    { from: "memorialised", on: "delete", to: "deleted", bp: "D05" },
  ],
});

/* ── Peer grant — §6 Grant lifecycle ──────────────────────────────────── */
export type GrantState = "invited" | "pending" | "active" | "refused" | "revoked" | "expired";

export type GrantEvent = "inviteeSignsIn" | "approve" | "refuse" | "narrow" | "revoke" | "sevenDays";

export const GrantMachine = defineMachine<GrantState, GrantEvent>({
  name: "PeerGrant",
  bp: "§6 Grant lifecycle",
  initial: ["invited"],
  terminal: ["refused", "revoked", "expired"],
  transitions: [
    // D02: an invitation to a number with no account is the NORMAL case.
    { from: "invited", on: "inviteeSignsIn", to: "pending", bp: "§6 · D02" },
    { from: "invited", on: "sevenDays", to: "expired", bp: "§6 · D02" },
    { from: "pending", on: "approve", to: "active", bp: "§6 · §4 S7" },
    { from: "pending", on: "refuse", to: "refused", bp: "§6 · §4 S7" },
    { from: "active", on: "narrow", to: "active", bp: "§6 · the subject may narrow the scope" },
    { from: "active", on: "revoke", to: "revoked", bp: "§6 · §4 S8" },
  ],
});
