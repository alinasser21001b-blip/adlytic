// Renders every synthetic case to a JPEG and writes cases.json with the ground truth.
//   npx tsx eval/fixtures/generate.ts
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { amounts, phoneNumbers } from "../../worker/engine/facts";
import { CASES, splitOf, type CaseSpec, type ImageSpec, type Pos } from "./cases";
import { productSvg } from "./products";

const here = dirname(fileURLToPath(import.meta.url));
const fonts = resolve(here, "../../public/fonts");
const POS_SQ: Record<Pos, number> = { top: 0.07, upper: 0.2, middle: 0.5, lower: 0.72, bottom: 0.86, foot: 0.94 };
const POS_V: Record<Pos, number> = { top: 0.08, upper: 0.24, middle: 0.42, lower: 0.56, bottom: 0.84, foot: 0.93 };

function fontFaces(): string {
  const f = (file: string, weight: number, range: string) =>
    `@font-face{font-family:Plex;src:url(file://${fonts}/${file}) format("woff2");font-weight:${weight};unicode-range:${range}}`;
  const ar = "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0898-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC";
  const la = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
  return [
    f("ibm-plex-sans-arabic-arabic-400-normal.woff2", 400, ar),
    f("ibm-plex-sans-arabic-arabic-600-normal.woff2", 600, ar),
    f("ibm-plex-sans-arabic-arabic-700-normal.woff2", 700, ar),
    f("ibm-plex-sans-arabic-latin-400-normal.woff2", 400, la),
    f("ibm-plex-sans-arabic-latin-600-normal.woff2", 600, la),
    f("ibm-plex-sans-arabic-latin-600-normal.woff2", 700, la),
  ].join("\n");
}

export function html(img: ImageSpec): string {
  const vertical = img.h / img.w > 1.6;
  const pos = vertical ? POS_V : POS_SQ;
  const [pt, ph] = img.productBox ?? (vertical ? [0.3, 0.45] : [0.28, 0.38]);
  const product = img.product
    ? `<div style="position:absolute;left:15%;width:70%;top:${pt * 100}%;height:${ph * 100}%">${productSvg(img.product, img.accent)}</div>`
    : "";
  const texts = img.texts
    .map((t) => {
      const pill = t.bg ? `background:${t.bg};padding:.18em .7em;border-radius:.5em;` : "";
      return `<div style="position:absolute;left:6%;right:6%;top:${pos[t.pos] * 100}%;transform:translateY(-50%);text-align:center">
        <span style="display:inline-block;font-size:${t.size}px;font-weight:${t.weight ?? 400};color:${t.color ?? "#111"};${pill}line-height:1.35">${t.text}</span></div>`;
    })
    .join("\n");
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>${fontFaces()}
  html,body{margin:0;width:${img.w}px;height:${img.h}px;overflow:hidden;background:${img.bg};font-family:Plex,sans-serif}</style></head>
  <body><div style="position:relative;width:${img.w}px;height:${img.h}px">${product}${texts}</div></body></html>`;
}

function truth(c: CaseSpec) {
  const owner = [c.adCopy, c.audience ?? "", c.additionalContext ?? ""].join("\n");
  const imageText = (c.image?.texts ?? []).map((t) => t.text).join("\n");
  return {
    ownerText: owner,
    imageTexts: (c.image?.texts ?? []).map((t) => ({ role: t.role, text: t.text, size: t.size })),
    imageAmounts: [...amounts(imageText)],
    ownerAmounts: [...amounts(owner)],
    imagePhones: phoneNumbers(imageText),
  };
}

export async function main() {
  const outDir = join(here, "img");
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const out = [];
  for (const c of CASES) {
    let image: { file: string; w: number; h: number; sha256: string } | null = null;
    if (c.image) {
      const page = await browser.newPage({ viewport: { width: c.image.w, height: c.image.h } });
      await page.setContent(html(c.image), { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const buf = await page.screenshot({ type: "jpeg", quality: 86 });
      await page.close();
      const file = `img/${c.id}.jpg`;
      writeFileSync(join(here, file), buf);
      image = { file, w: c.image.w, h: c.image.h, sha256: createHash("sha256").update(buf).digest("hex") };
    }
    const mode = c.image ? (c.adCopy ? "image_and_text" : "image_only") : "text_only";
    out.push({
      id: c.id, title: c.title, split: splitOf(c.id), industry: c.industry, goal: c.goal,
      adCopy: c.adCopy, audience: c.audience ?? "", additionalContext: c.additionalContext ?? "",
      mode, image, truth: truth(c), expect: c.expect, relevantRules: c.relevantRules, tags: c.tags,
    });
  }
  await browser.close();
  writeFileSync(join(here, "cases.json"), JSON.stringify({ fixtureVersion: "fx-2026-10-19.1", synthetic: true, cases: out }, null, 1));
  console.log(`rendered ${out.filter((c) => c.image).length} images, ${out.length} cases`);
}
if (process.argv[1]?.endsWith("generate.ts")) main();
