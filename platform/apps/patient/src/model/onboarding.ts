/**
 * E5–E8 — the onboarding journey, as one thing rather than four screens.
 *
 * @blueprint E5 · E6 · E7 · E8 · E12 · D26 · §3.1 · §9 Identity
 * @owner patient-app
 * @why This is the only place in the product where we ask a stranger for
 *      something before giving them anything, so every step of it is a place
 *      they can decide we are not worth it. The model exists to make the four
 *      screens one journey: the phone number typed on E5 is the number shown on
 *      E6, the attempts counted on E6 are the domain's, and the district chosen
 *      on E8 is the one the patient's request will search from.
 *
 *      Nothing here performs I/O and nothing here decides policy. Attempts and
 *      expiry belong to `@dawai/domain` Verification, because a client that
 *      could decide it had one more attempt could decide it had a hundred.
 */
import { REFUSAL, refuse, type Refusal, type Instant, Verification } from "@dawai/domain";
import { toWesternDigits } from "@dawai/design";

/* ── E5 · the number ──────────────────────────────────────────────────── */

/** Iraq. The only country Phase 0 launches in, stated once. */
export const COUNTRY_CODE = "+964";

/** The mobile prefixes in service in Iraq, after the national trunk zero is
 *  removed: Zain, Asiacell and Korek all sit in 75/77/78/79. */
const IRAQI_MOBILE = /^7[5789]\d{8}$/;

export type PhoneNumber = {
  /** E.164, the only form that leaves the device: «+9647701234567». */
  readonly e164: string;
  /** Nine digits after the prefix, for display: «770 123 4567». */
  readonly national: string;
};

/**
 * Read whatever the patient typed.
 *
 * Accepts the four things people actually write — «07701234567»,
 * «7701234567», «+9647701234567» and «009647701234567» — plus Arabic-Indic
 * digits, spaces and dashes, because a number copied out of a contacts app or
 * read off a SIM card carries all of them. Rejecting a real number for its
 * punctuation is the app refusing to do work the patient can see is trivial.
 */
export function parsePhone(raw: string): { readonly value: PhoneNumber | null; readonly refusal: Refusal | null } {
  const digits = toWesternDigits(raw).replace(/[^\d+]/g, "");

  if (digits === "" || digits === "+") return { value: null, refusal: refuse(REFUSAL.MALFORMED_NUMBER) };

  // Strip whichever international form was used, then the trunk zero.
  let national = digits.startsWith("+") ? digits.slice(1)
    : digits.startsWith("00") ? digits.slice(2)
    : digits;

  if (national.startsWith("964")) national = national.slice(3);
  else if (digits.startsWith("+") || digits.startsWith("00"))
    // An explicit international prefix that is not Iraq's. The distinction
    // matters: this is a number we cannot serve, not a number typed wrong, and
    // telling someone their correct number is malformed is the app blaming
    // them for our coverage.
    return { value: null, refusal: refuse(REFUSAL.UNSUPPORTED_COUNTRY, { typed: digits.slice(0, 4) }) };

  if (national.startsWith("0")) national = national.slice(1);

  if (!IRAQI_MOBILE.test(national)) return { value: null, refusal: refuse(REFUSAL.MALFORMED_NUMBER) };
  return { value: { e164: `${COUNTRY_CODE}${national}`, national }, refusal: null };
}

/** «770 123 4567» — grouped the way it is read aloud. */
export const displayPhone = (p: PhoneNumber): string =>
  `${p.national.slice(0, 3)} ${p.national.slice(3, 6)} ${p.national.slice(6)}`;

/* ── E6 · the code ────────────────────────────────────────────────────── */

export const CODE_LENGTH = 6;

/** Digits only, and never more than the code is long. */
export const cleanCode = (raw: string): string =>
  toWesternDigits(raw).replace(/\D/g, "").slice(0, CODE_LENGTH);

export const codeComplete = (code: string): boolean => cleanCode(code).length === CODE_LENGTH;

/**
 * How long until a resend is worth offering.
 *
 * A resend button that works instantly invites a patient to press it three
 * times and receive three codes, only the last of which works — which then
 * reads as the app sending broken codes. The wait is stated rather than merely
 * enforced.
 */
export const RESEND_AFTER_MS = 45_000;

export const resendIn = (issuedAt: Instant, now: Instant): number =>
  Math.max(0, Math.ceil((RESEND_AFTER_MS - (now - issuedAt)) / 1000));

/**
 * Everything E6 needs to say, derived from the challenge rather than from a
 * screen's own bookkeeping.
 */
export type CodeStatus = {
  readonly attemptsLeft: number;
  readonly expired: boolean;
  readonly spent: boolean;
  readonly canResendIn: number;
};

/**
 * E6 before the server has issued anything.
 *
 * The store navigates to E6 the moment the number is submitted, so there is a
 * real window — the SMS request's round trip — in which the screen is on
 * display and no challenge exists. Every field here is about the ABSENCE of a
 * challenge rather than a guess at one that has not been issued: nothing has
 * expired or been spent because nothing was sent, and no attempt has been made
 * against it.
 *
 * `canResendIn` is zero, which is the opposite of what it means once a code
 * exists. The wait is there to stop a patient collecting three codes and
 * finding only the last one works; with no code issued there is nothing to
 * collect. It also matters when the request FAILED — `requestCode` answers a
 * failure with no challenge at all, deliberately, so this window is where a
 * patient whose SMS was never sent is sitting, and «أرسل رمز جديد» is their
 * only way out of it.
 */
export const CODE_PENDING: CodeStatus = {
  attemptsLeft: Verification.MAX_ATTEMPTS,
  expired: false,
  spent: false,
  canResendIn: 0,
};

export function codeStatus(c: Verification.Challenge, now: Instant): CodeStatus {
  return {
    attemptsLeft: Verification.attemptsLeft(c),
    expired: Verification.isExpired(c, now) || c.state === "expired",
    spent: c.state === "spent",
    canResendIn: resendIn(c.issuedAt, now),
  };
}

/* ── E7 · the name ────────────────────────────────────────────────────── */

/**
 * The name a pharmacist will read off a counter.
 *
 * Trimmed, collapsed, and nothing else: no transliteration, no capitalisation,
 * no "correction". A person's name is not the app's to tidy, and a patient who
 * sees their name altered learns that this app edits what it is told.
 */
export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function checkName(raw: string): { readonly value: string | null; readonly refusal: Refusal | null } {
  const name = cleanName(raw);
  return name === ""
    ? { value: null, refusal: refuse(REFUSAL.NAME_REQUIRED) }
    : { value: name, refusal: null };
}

/**
 * What a pharmacy is shown at pickup — the first word only.
 *
 * E4 promises exactly this («تشوف اسمك الأول بس»), and a promise made on one
 * screen and kept by a different one is a promise nobody can check. Deriving it
 * here means E7 can SHOW the patient what will be shared before they submit it.
 */
export const firstNameOnly = (name: string): string => cleanName(name).split(" ")[0] ?? "";

/* ── E8 · the district ────────────────────────────────────────────────── */

export type District = {
  readonly districtId: string;
  readonly name: string;
  readonly city: string;
  /** Whether Dawai actually operates here. E12 exists because some do not. */
  readonly covered: boolean;
};

export function checkDistrict(
  chosen: string | null,
  districts: readonly District[],
): { readonly value: District | null; readonly refusal: Refusal | null } {
  if (chosen === null) return { value: null, refusal: refuse(REFUSAL.DISTRICT_REQUIRED) };
  const d = districts.find((x) => x.districtId === chosen);
  if (!d) return { value: null, refusal: refuse(REFUSAL.DISTRICT_REQUIRED) };
  // Not an error the patient made. E12 says this honestly: we have not arrived
  // there yet, and that is our failing rather than theirs.
  if (!d.covered) return { value: null, refusal: refuse(REFUSAL.OUTSIDE_COVERAGE, { districtId: d.districtId }) };
  return { value: d, refusal: null };
}

/** Search over the bundled list. Matches on either the district or its city, so
 *  a patient who thinks in city names finds their district anyway. */
export function filterDistricts(districts: readonly District[], query: string): readonly District[] {
  const q = cleanName(query);
  if (q === "") return districts;
  return districts.filter((d) => d.name.includes(q) || d.city.includes(q));
}
