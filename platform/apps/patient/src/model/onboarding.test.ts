/**
 * @blueprint E5 · E6 · E7 · E8 · E12 · D26
 * @owner patient-app
 * @why This module reads what a stranger types before the product has given
 *      them anything, so every rejection here is a place someone leaves. The
 *      cases below are the ones people actually type — a number copied out of
 *      a contacts app, a code pasted from an SMS, a name with a double space —
 *      because rejecting a real number for its punctuation is the app refusing
 *      work the patient can see is trivial.
 */
import { describe, expect, it } from "vitest";
import { instant, Verification } from "@dawai/domain";
import {
  COUNTRY_CODE, CODE_LENGTH, RESEND_AFTER_MS,
  parsePhone, displayPhone, cleanCode, codeComplete, resendIn, codeStatus,
  cleanName, checkName, firstNameOnly, checkDistrict, filterDistricts, type District,
} from "./onboarding.js";

describe("E5 — reading the number people actually type", () => {
  const e164 = (raw: string) => parsePhone(raw).value?.e164 ?? null;

  it("accepts the four forms in circulation", () => {
    for (const raw of ["07701234567", "7701234567", "+9647701234567", "009647701234567"])
      expect(e164(raw), raw).toBe("+9647701234567");
  });

  it("accepts the punctuation a contacts app carries", () => {
    for (const raw of ["0770 123 4567", "0770-123-4567", "+964 770 123 4567", " 07701234567 "])
      expect(e164(raw), raw).toBe("+9647701234567");
  });

  it("accepts Arabic-Indic digits — a keyboard an Iraqi patient has enabled", () => {
    expect(e164("٠٧٧٠١٢٣٤٥٦٧")).toBe("+9647701234567");
    expect(e164("۰۷۷۰۱۲۳۴۵۶۷")).toBe("+9647701234567");
  });

  it("accepts every carrier prefix in service", () => {
    for (const p of ["75", "77", "78", "79"])
      expect(e164(`0${p}01234567`), p).toBe(`${COUNTRY_CODE}${p}01234567`);
  });

  it("rejects a prefix no Iraqi carrier uses", () => {
    for (const p of ["70", "71", "76"])
      expect(parsePhone(`0${p}01234567`).refusal?.code, p).toBe("MALFORMED_NUMBER");
  });

  it("rejects a number of the wrong length", () => {
    expect(parsePhone("077012345").refusal?.code).toBe("MALFORMED_NUMBER");
    expect(parsePhone("0770123456789").refusal?.code).toBe("MALFORMED_NUMBER");
  });

  it("empty is malformed, not a crash", () => {
    expect(parsePhone("").refusal?.code).toBe("MALFORMED_NUMBER");
    expect(parsePhone("+").refusal?.code).toBe("MALFORMED_NUMBER");
    expect(parsePhone("   ").refusal?.code).toBe("MALFORMED_NUMBER");
  });

  it("a correct number from another country is unsupported, not malformed", () => {
    // Telling someone their own correct number is malformed is the app blaming
    // them for our coverage.
    expect(parsePhone("+201012345678").refusal?.code).toBe("UNSUPPORTED_COUNTRY");
    expect(parsePhone("00201012345678").refusal?.code).toBe("UNSUPPORTED_COUNTRY");
  });

  it("never returns both a value and a refusal", () => {
    for (const raw of ["07701234567", "", "+201012345678", "0700"]) {
      const r = parsePhone(raw);
      expect(r.value === null, raw).toBe(r.refusal !== null);
    }
  });

  it("displays the number the way it is read aloud", () => {
    expect(displayPhone(parsePhone("07701234567").value!)).toBe("770 123 4567");
  });
});

describe("E6 — the code", () => {
  it("keeps digits only and never more than the code is long", () => {
    expect(cleanCode("12 34-56")).toBe("123456");
    expect(cleanCode("1234567890")).toHaveLength(CODE_LENGTH);
    expect(cleanCode("١٢٣٤٥٦")).toBe("123456");
  });

  it("is complete only at full length", () => {
    expect(codeComplete("12345")).toBe(false);
    expect(codeComplete("123456")).toBe(true);
    expect(codeComplete("12345a")).toBe(false);
  });

  it("derives what E6 says from the challenge, not from a screen's own bookkeeping", () => {
    const fresh: Verification.Challenge = { challengeId: "ch-1", state: "sent", used: 0, issuedAt: instant(0) };
    const now = codeStatus(fresh, instant(1_000));
    expect(now.attemptsLeft).toBe(Verification.MAX_ATTEMPTS);
    expect(now.expired).toBe(false);
    expect(now.spent).toBe(false);

    // The clock alone expires it — the screen is not asked to notice.
    expect(codeStatus(fresh, instant(Verification.CODE_LIFETIME_MS)).expired).toBe(true);

    const used = codeStatus({ ...fresh, used: 2 }, instant(1_000));
    expect(used.attemptsLeft).toBe(Verification.MAX_ATTEMPTS - 2);

    expect(codeStatus({ ...fresh, state: "spent" }, instant(1_000)).spent).toBe(true);
    expect(codeStatus({ ...fresh, state: "expired" }, instant(1_000)).expired).toBe(true);
  });

  it("counts the resend down in whole seconds and never below zero", () => {
    const issued = instant(0);
    expect(resendIn(issued, instant(0))).toBe(RESEND_AFTER_MS / 1000);
    expect(resendIn(issued, instant(RESEND_AFTER_MS))).toBe(0);
    expect(resendIn(issued, instant(RESEND_AFTER_MS + 60_000))).toBe(0);
  });
});

describe("E7 — the name is the patient's, not the app's to tidy", () => {
  it("trims and collapses, and does nothing else", () => {
    expect(cleanName("  أم   علي  ")).toBe("أم علي");
    expect(cleanName("عبد الرحمن")).toBe("عبد الرحمن");
  });

  it("an empty name is refused by name", () => {
    expect(checkName("   ").refusal?.code).toBe("NAME_REQUIRED");
    expect(checkName("أم علي").value).toBe("أم علي");
  });

  it("E4's promise is derived, so the screen can show what will be shared", () => {
    expect(firstNameOnly("أم علي الكاظمي")).toBe("أم");
    expect(firstNameOnly("  علي  ")).toBe("علي");
    expect(firstNameOnly("")).toBe("");
  });
});

describe("E8 and E12 — the district", () => {
  const districts: readonly District[] = [
    { districtId: "d1", name: "الكرادة", city: "بغداد", covered: true },
    { districtId: "d2", name: "الموصل الجديدة", city: "الموصل", covered: false },
  ];

  it("nothing chosen is refused", () => {
    expect(checkDistrict(null, districts).refusal?.code).toBe("DISTRICT_REQUIRED");
  });

  it("a district not on the list is refused the same way", () => {
    expect(checkDistrict("d99", districts).refusal?.code).toBe("DISTRICT_REQUIRED");
  });

  it("E12 — an uncovered district is our failing, and says so with its own code", () => {
    const r = checkDistrict("d2", districts);
    expect(r.refusal?.code).toBe("OUTSIDE_COVERAGE");
    expect(r.refusal?.detail?.["districtId"]).toBe("d2");
  });

  it("a covered district passes with the district itself", () => {
    expect(checkDistrict("d1", districts).value?.name).toBe("الكرادة");
  });

  it("search matches the city too, so a patient who thinks in cities finds theirs", () => {
    expect(filterDistricts(districts, "الموصل").map((d) => d.districtId)).toEqual(["d2"]);
    expect(filterDistricts(districts, "بغداد").map((d) => d.districtId)).toEqual(["d1"]);
    expect(filterDistricts(districts, "")).toHaveLength(2);
  });
});
