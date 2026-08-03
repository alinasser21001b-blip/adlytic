/**
 * @blueprint §25 · D34
 * @owner platform-foundation
 * @why The rule is four-way and English is two-way, so every category that is
 *      not "many" is a category an English-speaking author forgets. These pin
 *      all four against the strings the product actually shipped wrong.
 */
import { describe, expect, it } from "vitest";
import { counted, plural } from "./arabic.js";

const MINUTES = { one: "دقيقة", two: "دقيقتين", few: "دقائق", many: "دقيقة" } as const;

describe("the four categories", () => {
  it("one drops the numeral", () => {
    // «١ دقيقة» is not how anyone says it, and «١ دقائق» — which shipped — is
    // simply wrong.
    expect(counted(1, MINUTES)).toBe("دقيقة");
  });

  it("two is the dual, and drops the numeral too", () => {
    // The form English does not have, and the one most often missed.
    expect(counted(2, MINUTES)).toBe("دقيقتين");
  });

  it("three to ten state the numeral with the broken plural", () => {
    expect(counted(3, MINUTES)).toBe("3 دقائق");
    expect(counted(10, MINUTES)).toBe("10 دقائق");
  });

  it("eleven and above return to the SINGULAR", () => {
    // The category a codebase that treats "plural" as one thing gets wrong on
    // every large number it prints.
    expect(counted(11, MINUTES)).toBe("11 دقيقة");
    expect(counted(45, MINUTES)).toBe("45 دقيقة");
  });

  it("zero takes the many form", () => {
    expect(counted(0, MINUTES)).toBe("0 دقيقة");
  });

  it("the hundreds boundary follows the last two digits", () => {
    // 103 is «١٠٣ دقائق» and 111 is «١١١ دقيقة» — the category is decided by
    // n % 100, which is why it is not a simple threshold.
    expect(counted(103, MINUTES)).toBe("103 دقائق");
    expect(counted(111, MINUTES)).toBe("111 دقيقة");
    expect(counted(100, MINUTES)).toBe("100 دقيقة");
  });
});

describe("plural selects anything, not only nouns", () => {
  it("carries the agreement past the noun", () => {
    // «تقرر بيه» against «تقرر بيهم» — the reason this returns whole phrases
    // rather than a noun for the caller to assemble.
    const forms = {
      one: "باقي بديل واحد تقرر بيه",
      two: "باقي بديلين تقرر بيهم",
      few: "باقي 3 بدائل تقرر بيهم",
      many: "باقي 11 بديل تقرر بيهم",
    } as const;
    expect(plural(1, forms)).toBe(forms.one);
    expect(plural(2, forms)).toBe(forms.two);
    expect(plural(3, forms)).toBe(forms.few);
    expect(plural(11, forms)).toBe(forms.many);
  });

  it("a fraction counts as its whole part rather than falling through", () => {
    // Nothing in this product counts halves; folding is safer than a category
    // nobody wrote words for.
    expect(plural(1.7, MINUTES)).toBe(MINUTES.one);
  });

  it("digits stay Western — the render layer converts once (§25)", () => {
    // Converting here would be a second numeral formatter to keep in step with
    // the one every string already passes through.
    expect(counted(5, MINUTES)).toContain("5");
  });
});
