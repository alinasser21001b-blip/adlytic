import { describe, expect, it } from "vitest";
import { providerReportSchema } from "../../shared/schemas";
import { enforceMode, extractNumbers, findUnsupportedClaims, sanitizeShareTips, stripUnsupported } from "../../worker/services/guards";
import { toPublicView } from "../../worker/services/reports";
import { sniffImage } from "../../worker/validation/image";
import { goodReport } from "../support/mock-provider";

describe("fact guard", () => {
  it("normalises Arabic-Indic digits and thousands separators", () => {
    expect(extractNumbers("السعر ٢٥٬٠٠٠ دينار")).toEqual(["25000"]);
    expect(extractNumbers("25,000 أو 25.000")).toEqual(["25000", "25000"]);
  });

  it("flags numbers and offer words absent from the owner's facts", () => {
    expect(findUnsupportedClaims("السعر 25000 مع خصم 20%", "كنبة مخمل")).toEqual(expect.arrayContaining(["25000", "20", "discount", "percent"]));
    expect(findUnsupportedClaims("السعر ٢٥٠٠٠ دينار", "السعر 25,000")).toEqual([]);
    expect(findUnsupportedClaims("توصيل مجاني لكل المحافظات", "كنبة")).toContain("free");
    expect(findUnsupportedClaims("نضمن لك الجودة مع ضمان سنة", "كنبة")).toContain("guarantee");
  });

  it("strips only the offending sentences", () => {
    const out = stripUnsupported("كنبة مريحة. السعر 25000 دينار. متوفرة بألوان.", ["25000"], "كنبة");
    expect(out).toBe("كنبة مريحة. متوفرة بألوان.");
  });
});

describe("mode guard", () => {
  it("text-only forces visual readability to not_assessed and drops image evidence", () => {
    const r = providerReportSchema.parse(goodReport());
    const g = enforceMode(r, "text_only");
    expect(g.assessments.visualReadability.status).toBe("not_assessed");
    expect(g.issues.some((i) => i.evidenceSource === "image")).toBe(false);
    expect(g.imageTextLegibility).toBe("no_image");
    expect(enforceMode(r, "image_and_text")).toBe(r);
  });
});

describe("contract", () => {
  it("rejects incomplete or oversized provider output", () => {
    expect(providerReportSchema.safeParse({ summary: "ناقص" }).success).toBe(false);
    expect(providerReportSchema.safeParse(goodReport({ actionItems: ["واحد فقط"] })).success).toBe(false);
    expect(providerReportSchema.safeParse(goodReport({ summary: "س".repeat(401) })).success).toBe(false);
    expect(providerReportSchema.safeParse(goodReport({ score: 87 })).success).toBe(true); // unknown keys are dropped, not stored
    expect("score" in providerReportSchema.parse(goodReport({ score: 87 }))).toBe(false);
  });
});

describe("share guard", () => {
  it("drops tips with digits, quotes, links or offers", () => {
    expect(sanitizeShareTips(["اجعل طريقة الطلب واضحة.", "اذكر السعر 25 ألف", "اكتب «عرض خاص»", "زر www.x.com", "قدّم خصم"])).toEqual(["اجعل طريقة الطلب واضحة."]);
  });

  it("public view is an allowlist of statuses and sanitized tips only", () => {
    const report = { ...providerReportSchema.parse(goodReport()), schemaVersion: "1" as const, id: "abcdefgh1234", mode: "image_and_text" as const, industry: "furniture" as const, goal: "messages" as const, createdAt: new Date().toISOString(), expiresAt: new Date().toISOString(), shareableTips: ["نصيحة عامة."] };
    const v = toPublicView(report);
    expect(Object.keys(v).sort()).toEqual(["axes", "createdAt", "mode", "tips"]);
    expect(JSON.stringify(v)).not.toContain(report.improvedCopy.opening);
    expect(JSON.stringify(v)).not.toContain(report.perceivedMessage);
  });
});

describe("image sniffing", () => {
  const b = (...xs: number[]) => new Uint8Array(xs);
  const s = (str: string) => [...new TextEncoder().encode(str)];
  it("trusts magic bytes, not names", () => {
    expect(sniffImage(b(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImage(b(0x89, ...s("PNG"), 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffImage(b(...s("RIFF"), 0, 0, 0, 0, ...s("WEBP")))).toBe("image/webp");
    expect(sniffImage(b(0, 0, 0, 24, ...s("ftypheic")))).toBe("heic");
    expect(sniffImage(b(...s("%PDF-1.7")))).toBeNull();
    expect(sniffImage(b(...s("GIF89a")))).toBeNull();
    expect(sniffImage(b(...s("<svg xmlns")))).toBeNull();
  });
});
