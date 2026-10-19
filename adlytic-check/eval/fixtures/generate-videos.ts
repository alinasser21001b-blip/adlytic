// Renders VIDEO_CASES to H.264/AAC MP4 files with ffmpeg (stills held per scene).
//   CHROMIUM_PATH=… npx tsx eval/fixtures/generate-videos.ts
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { html } from "./generate";
import { VIDEO_CASES } from "./videos";

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const outDir = join(here, "video");
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const index = [];
  for (const v of VIDEO_CASES) {
    const tmp = mkdtempSync(join(tmpdir(), `vf-${v.id}-`));
    const list: string[] = [];
    for (const [i, sc] of v.scenes.entries()) {
      const page = await browser.newPage({ viewport: { width: v.w, height: v.h } });
      await page.setContent(html({ w: v.w, h: v.h, bg: sc.bg, product: sc.product, accent: sc.accent, texts: sc.texts, productBox: sc.productBox }), { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const png = join(tmp, `s${i}.png`);
      await page.screenshot({ path: png });
      await page.close();
      list.push(`file '${png}'`, `duration ${sc.to - sc.from}`);
    }
    list.push(`file '${join(tmp, `s${v.scenes.length - 1}.png`)}'`);
    writeFileSync(join(tmp, "list.txt"), list.join("\n"));
    const out = join(outDir, `${v.id}.mp4`);
    const audioArgs =
      v.audio.kind === "none"
        ? []
        : v.audio.kind === "tone"
          ? ["-f", "lavfi", "-i", `sine=frequency=330:sample_rate=44100:duration=${v.duration}`]
          : ["-f", "lavfi", "-i", `anullsrc=r=44100:cl=mono:d=${v.duration}`];
    execFileSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "concat", "-safe", "0", "-i", join(tmp, "list.txt"),
      ...audioArgs,
      "-vf", "fps=15,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "30",
      ...(audioArgs.length ? ["-c:a", "aac", "-b:a", "48k", "-shortest"] : []),
      "-t", String(v.duration), "-movflags", "+faststart", out,
    ]);
    rmSync(tmp, { recursive: true, force: true });
    index.push({ id: v.id, file: `video/${v.id}.mp4`, sha256: createHash("sha256").update(readFileSync(out)).digest("hex") });
  }
  await browser.close();
  writeFileSync(join(here, "videos.json"), JSON.stringify({ fixtureVersion: "vfx-2026-10-19.1", synthetic: true, note: "Speech segments are ground truth fed as the ASR result; the MP4 audio for speech cases is silence.", videos: index, cases: VIDEO_CASES }, null, 1));
  console.log(`rendered ${index.length} videos`);
}
main();
