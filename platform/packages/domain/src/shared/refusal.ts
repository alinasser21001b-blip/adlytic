/**
 * Refusal — the closed set of reasons the domain may refuse.
 *
 * @blueprint §5 rule 3 · §7 · D18 · D42 · D19
 * @owner platform-foundation
 * @why Refusals are a product surface: a patient reads them and a pharmacist
 *      acts on them. Leaving the set open invites a new refusal string to be
 *      invented in a controller, which is exactly the hidden business logic
 *      Rule 3 forbids. Every reason here traces to a Blueprint decision.
 * @implements domain/refusal
 */

export const REFUSAL = {
  /* Authority — §5. A missing relationship and a forbidden one are the SAME
     refusal, so no lookup becomes an identity oracle (§5 rule 3). */
  NOT_FOUND_OR_NOT_YOURS: "NOT_FOUND_OR_NOT_YOURS",

  /* Clinical gates — §7 */
  PRESCRIPTION_REQUIRED: "PRESCRIPTION_REQUIRED",     // D18
  CONTROLLED_NOT_SUPPORTED: "CONTROLLED_NOT_SUPPORTED", // D42
  SUBSTITUTION_REQUIRES_PHARMACIST: "SUBSTITUTION_REQUIRES_PHARMACIST", // D19
  SUBSTITUTION_NOT_ACKNOWLEDGED: "SUBSTITUTION_NOT_ACKNOWLEDGED", // §4 R10

  /* Marketplace — §8 */
  ITEM_NOT_REQUESTABLE: "ITEM_NOT_REQUESTABLE",
  TOO_MANY_LINES: "TOO_MANY_LINES",
  NO_LINES: "NO_LINES",
  OUTSIDE_COVERAGE: "OUTSIDE_COVERAGE",
  OFFER_WITHDRAWN: "OFFER_WITHDRAWN",
  OFFER_EXPIRED: "OFFER_EXPIRED",
  ALREADY_ANSWERED: "ALREADY_ANSWERED",
  PRICE_REQUIRED: "PRICE_REQUIRED",
  UNAVAILABLE_REASON_REQUIRED: "UNAVAILABLE_REASON_REQUIRED",
  ALREADY_ACCEPTED: "ALREADY_ACCEPTED",
  NOTHING_ACCEPTED: "NOTHING_ACCEPTED",

  /* Identity — §9 */
  MANAGED_SUBJECT_LIMIT: "MANAGED_SUBJECT_LIMIT",
  NUMBER_ALREADY_REGISTERED: "NUMBER_ALREADY_REGISTERED",
  ALREADY_SELF: "ALREADY_SELF",
  INVITE_EXPIRED: "INVITE_EXPIRED",
  SUBJECT_MEMORIALISED: "SUBJECT_MEMORIALISED",
  REVERSAL_WINDOW_PASSED: "REVERSAL_WINDOW_PASSED",
  DEPENDENT_DISPOSITION_MISSING: "DEPENDENT_DISPOSITION_MISSING",
  OWN_NUMBER: "OWN_NUMBER",
  GRANT_EXISTS: "GRANT_EXISTS",

  /* Identity — onboarding. Every one of these is a failure Blueprint v3
     declares by name for E5, E6, E7 or E8, so the code exists because the
     Blueprint names the case, not because a screen wanted a message. */
  MALFORMED_NUMBER: "MALFORMED_NUMBER",             // E5 f: malformed number
  UNSUPPORTED_COUNTRY: "UNSUPPORTED_COUNTRY",       // E5 f: unsupported country
  WRONG_CODE: "WRONG_CODE",                         // E6 f: wrong code, attempts left
  ATTEMPTS_EXHAUSTED: "ATTEMPTS_EXHAUSTED",         // E6 f: exhausted attempts
  CODE_EXPIRED: "CODE_EXPIRED",                     // E6 f: expired code
  RATE_LIMITED: "RATE_LIMITED",                     // E6 st: rate-limited
  NAME_REQUIRED: "NAME_REQUIRED",                   // E7 f: empty name
  DISTRICT_REQUIRED: "DISTRICT_REQUIRED",           // E8 st: error

  /* Watches — D30 */
  WATCH_LIMIT: "WATCH_LIMIT",

  /* Pharmacy — §6 */
  LAST_MANAGER_CANNOT_BE_REMOVED: "LAST_MANAGER_CANNOT_BE_REMOVED",
  BRANCH_NOT_ELIGIBLE: "BRANCH_NOT_ELIGIBLE",
  REQUIRES_MANAGER: "REQUIRES_MANAGER",
  REQUIRES_PHARMACIST: "REQUIRES_PHARMACIST",

  /* State machines — Rule 5. The single refusal for every transition that the
     published machine does not contain. */
  ILLEGAL_TRANSITION: "ILLEGAL_TRANSITION",
} as const;

export type RefusalCode = (typeof REFUSAL)[keyof typeof REFUSAL];

export type Refusal = {
  readonly code: RefusalCode;
  /** Structured context for logs and for the caller. Never a rendered string —
   *  the domain does not decide how a refusal is worded (Rule 4). */
  readonly detail?: Readonly<Record<string, string | number | boolean>>;
};

export const refuse = (code: RefusalCode, detail?: Refusal["detail"]): Refusal =>
  detail === undefined ? { code } : { code, detail };
